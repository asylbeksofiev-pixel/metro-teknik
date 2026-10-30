import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";
import type { Json } from "@/lib/supabase/database.types";
import { notifyDocument } from "@/lib/server/notify";
import { logSystemError } from "@/lib/server/audit";
import { aiConfigured } from "./client";
import { extractDocx, extractPdf, MAX_PAGES, renderPdfPage, toDataUrl, type PageText } from "./extract";
import { ocrImage, structureDocument, toEditableQuestion } from "./tasks";
import { isLocale } from "@/lib/i18n/config";

export type DocumentResult = {
  ai: boolean;
  title: string | null;
  instructions: string | null;
  questions: (ReturnType<typeof toEditableQuestion> & { note: string | null })[];
  warnings: string[];
  /** Machine-readable warning codes the UI translates. */
  codes: ("ai_unavailable" | "scanned_pages_skipped" | "docx_images_ignored" | "too_many_pages" | "no_text")[];
};

async function processOne(job: Tables<"ocr_jobs">) {
  const admin = createAdminClient();
  const setStatus = (status: Tables<"ocr_jobs">["status"], extra: Partial<Tables<"ocr_jobs">> = {}) =>
    admin.from("ocr_jobs").update({ status, locked_at: new Date().toISOString(), ...extra }).eq("id", job.id);

  const hints = (job.hints ?? {}) as { subject?: string; grade?: number; locale?: string };
  const locale = isLocale(hints.locale) ? hints.locale : "ru";
  const ctx = { userId: job.created_by, schoolId: job.school_id };
  const codes: DocumentResult["codes"] = [];

  await setStatus("extracting_text");
  const file = await admin.storage.from("assessment-documents").download(job.storage_path);
  if (file.error || !file.data) throw new Error(`download failed: ${file.error?.message ?? "no data"}`);
  const buf = new Uint8Array(await file.data.arrayBuffer());

  let pages: PageText[] = [];
  let pageCount = 1;
  if (job.mime_type === "application/pdf") {
    const pdf = await extractPdf(buf);
    pages = pdf.pages;
    pageCount = pdf.pageCount;
    if (pdf.pageCount > MAX_PAGES) codes.push("too_many_pages");
    if (pdf.scanned.length) {
      if (!aiConfigured()) codes.push("scanned_pages_skipped");
      else {
        for (const p of pdf.scanned) {
          const img = await renderPdfPage(buf, p);
          const res = await ocrImage(img, "document", ctx);
          if (!res.ok) throw new Error(`ocr page ${p}: ${res.error}`);
          pages.push({ page: p, text: res.data.text, method: "vision_ocr", uncertain: res.data.uncertain, notes: res.data.notes ?? undefined });
        }
      }
    }
  } else if (job.mime_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const docx = await extractDocx(buf);
    pages = docx.pages;
    if (docx.imageCount > 0) codes.push("docx_images_ignored");
  } else {
    if (!aiConfigured()) codes.push("scanned_pages_skipped");
    else {
      const res = await ocrImage(toDataUrl(buf, job.mime_type), "document", ctx);
      if (!res.ok) throw new Error(`ocr: ${res.error}`);
      pages = [{ page: 1, text: res.data.text, method: "vision_ocr", uncertain: res.data.uncertain, notes: res.data.notes ?? undefined }];
    }
  }
  pages.sort((a, b) => a.page - b.page);

  await admin.from("ocr_transcriptions").delete().eq("job_id", job.id);
  if (pages.length) {
    const { error } = await admin.from("ocr_transcriptions").insert(
      pages.map((p) => ({ job_id: job.id, page: p.page, method: p.method, text: p.text, uncertain: p.uncertain, notes: p.notes ?? null })),
    );
    if (error) throw new Error(`save transcription: ${error.message}`);
  }

  const fullText = pages.map((p) => (pages.length > 1 ? `--- ${p.page} ---\n${p.text}` : p.text)).join("\n\n").trim();
  const result: DocumentResult = { ai: false, title: null, instructions: null, questions: [], warnings: [], codes };
  if (!fullText) codes.push("no_text");
  else if (!aiConfigured()) codes.push("ai_unavailable");
  else {
    await setStatus("generating_questions");
    const res = await structureDocument(fullText.slice(0, 60000), { subject: hints.subject, grade: hints.grade, locale }, ctx);
    if (!res.ok) throw new Error(`structure: ${res.error}`);
    result.ai = true;
    result.title = res.data.title ?? null;
    result.instructions = res.data.instructions ?? null;
    result.warnings = res.data.warnings;
    result.questions = res.data.questions.map((q) => ({ ...toEditableQuestion(q), note: q.uncertaintyNote ?? null }));
  }

  await setStatus("review_required", { page_count: pageCount, result: result as unknown as Json, last_error: null, locked_at: null });
  await notifyDocument(job.id, true);
}

/** Claims and processes up to `limit` document jobs. */
export async function processOcrJobs(limit: number): Promise<number> {
  const admin = createAdminClient();
  let done = 0;
  for (let i = 0; i < limit; i++) {
    const { data: job } = await admin.rpc("claim_ocr_job");
    if (!job || !job.id) break;
    try {
      await processOne(job);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await logSystemError("ocr", message, { jobId: job.id });
      const final = job.tries >= 3;
      await admin.from("ocr_jobs").update({ status: final ? "failed" : "uploaded", last_error: message.slice(0, 500), locked_at: null }).eq("id", job.id);
      if (final) await notifyDocument(job.id, false);
    }
    done++;
  }
  return done;
}
