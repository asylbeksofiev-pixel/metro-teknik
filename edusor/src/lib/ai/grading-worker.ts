import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";
import { logSystemError } from "@/lib/server/audit";
import { contentSchemas, type QuestionType, type Rubric, type SnapshotQuestion } from "@/lib/assessment/schema";
import { isLocale } from "@/lib/i18n/config";
import { aiConfigured } from "./client";
import { extractPdf, toDataUrl } from "./extract";
import { ocrImage, suggestGrade } from "./tasks";
import { describeResponse } from "@/lib/assessment/describe";

const LOW_CONFIDENCE = 0.7;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Transcribes uploaded answer files once (images via vision OCR, PDFs via text layer). */
async function transcribeFiles(attemptId: string, questionId: string, ctx: { userId: string | null; schoolId: string | null }): Promise<string> {
  const admin = createAdminClient();
  const { data: files } = await admin.from("submission_files").select("id, storage_path, mime_type, file_name").eq("attempt_id", attemptId).eq("question_id", questionId);
  const parts: string[] = [];
  for (const f of files ?? []) {
    const { data: existing } = await admin.from("ocr_transcriptions").select("text").eq("submission_file_id", f.id).order("page");
    if (existing?.length) {
      parts.push(existing.map((e) => e.text).join("\n"));
      continue;
    }
    const dl = await admin.storage.from("submissions").download(f.storage_path);
    if (dl.error || !dl.data) continue;
    const buf = new Uint8Array(await dl.data.arrayBuffer());
    let rows: { page: number; text: string; method: "pdf_text" | "vision_ocr"; uncertain: boolean }[] = [];
    if (f.mime_type === "application/pdf") {
      const pdf = await extractPdf(buf);
      rows = pdf.pages.map((p) => ({ page: p.page, text: p.text, method: "pdf_text", uncertain: false }));
    } else if (f.mime_type.startsWith("image/")) {
      const res = await ocrImage(toDataUrl(buf, f.mime_type), "student_answer", ctx);
      if (!res.ok) throw new Error(`ocr: ${res.error}`);
      rows = [{ page: 1, text: res.data.text, method: "vision_ocr", uncertain: res.data.uncertain }];
    }
    if (rows.length) {
      await admin.from("ocr_transcriptions").insert(rows.map((r) => ({ ...r, submission_file_id: f.id })));
      parts.push(rows.map((r) => r.text).join("\n"));
    }
  }
  return parts.join("\n\n");
}

async function processOne(job: Tables<"grading_jobs">) {
  const admin = createAdminClient();
  const { data: answer } = await admin
    .from("answers")
    .select("id, question_id, response, attempt:attempts(id, snapshot_id, student_id, assessment:assessments(school_id, grading_profile))")
    .eq("id", job.answer_id)
    .single();
  if (!answer?.attempt?.assessment) throw new Error("answer not found");
  const attempt = answer.attempt;
  const [{ data: key }, { data: snap }, { data: student }] = await Promise.all([
    admin.from("assessment_snapshot_keys").select("type, points, answer_key, rubric").eq("snapshot_id", attempt.snapshot_id).eq("question_id", answer.question_id).single(),
    admin.from("assessment_snapshots").select("questions").eq("id", attempt.snapshot_id).single(),
    admin.from("profiles").select("locale").eq("id", attempt.student_id).single(),
  ]);
  if (!key) throw new Error("key not found");
  const question = ((snap?.questions ?? []) as SnapshotQuestion[]).find((q) => q.id === answer.question_id);
  const type = key.type as QuestionType;
  const content = contentSchemas[type].safeParse(question?.content ?? {});
  const promptText = content.success ? String((content.data as { prompt: string }).prompt) : "";
  const ctx = { userId: job.requested_by, schoolId: attempt.assessment.school_id };

  // Student identity is never sent to the AI provider — only the question, key and answer content.
  let answerText = describeResponse(type, question?.content ?? {}, answer.response);
  if (type === "file_upload" || type === "image_answer") answerText = await transcribeFiles(attempt.id, answer.question_id, ctx);
  const ak = key.answer_key as { referenceAnswer?: string; accepted?: string[] };
  const max = Number(key.points);

  const res = await suggestGrade(
    {
      questionText: promptText,
      questionType: type,
      maxPoints: max,
      rubric: key.rubric as Rubric | null,
      reference: ak.referenceAnswer ?? "",
      acceptedAnswers: ak.accepted,
      answerText,
      profile: attempt.assessment.grading_profile,
      locale: isLocale(student?.locale) ? student.locale : "ru",
    },
    ctx,
  );
  if (!res.ok) throw new Error(`ai: ${res.error}${res.detail ? ` (${res.detail})` : ""}`);

  // Enforce limits server-side regardless of model output.
  const rubric = (key.rubric as Rubric | null)?.criteria ?? [];
  const criteria = rubric.length
    ? rubric.map((c) => {
        const given = res.data.criteria.find((x) => x.criterionId === c.id);
        return { id: c.id, title: c.title, max: c.maxPoints, score: round2(Math.min(c.maxPoints, Math.max(0, given?.score ?? 0))), comment: given?.comment ?? "" };
      })
    : [];
  const total = round2(Math.min(max, Math.max(0, criteria.length ? criteria.reduce((s, c) => s + c.score, 0) : res.data.suggestedScore)));
  const missingCriteria = rubric.length > 0 && rubric.some((c) => !res.data.criteria.some((x) => x.criterionId === c.id));
  const needsReview = res.data.needsManualReview || res.data.confidence < LOW_CONFIDENCE || missingCriteria;

  const { data: suggestion, error } = await admin
    .from("grading_suggestions")
    .insert({
      answer_id: answer.id,
      job_id: job.id,
      suggested_score: total,
      max_score: max,
      explanation: res.data.explanation,
      feedback: res.data.feedback,
      confidence: Math.round(res.data.confidence * 1000) / 1000,
      needs_manual_review: needsReview,
      profile: attempt.assessment.grading_profile,
      model: res.model,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (criteria.length) {
    await admin.from("criterion_scores").insert(criteria.map((c) => ({ suggestion_id: suggestion.id, criterion_id: c.id, title: c.title, score: c.score, max_score: c.max, comment: c.comment })));
  }
  await admin.from("grading_jobs").update({ status: "done", last_error: null, locked_at: null }).eq("id", job.id);
}

/** Produces AI grading suggestions. Never sets final scores — the teacher approves them. */
export async function processGradingJobs(limit: number): Promise<number> {
  if (!aiConfigured()) return 0;
  const admin = createAdminClient();
  let done = 0;
  for (let i = 0; i < limit; i++) {
    const { data: job } = await admin.rpc("claim_grading_job");
    if (!job || !job.id) break;
    try {
      await processOne(job);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await logSystemError("ai.grading", message, { jobId: job.id });
      await admin.from("grading_jobs").update({ status: job.tries >= 3 ? "failed" : "queued", last_error: message.slice(0, 500), locked_at: null }).eq("id", job.id);
    }
    done++;
  }
  return done;
}
