import { randomUUID } from "node:crypto";
import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { detectFileType, EXT, safeFileName } from "@/lib/server/files";
import { rateLimit } from "@/lib/server/rate-limit";
import { runBackgroundJobs } from "@/lib/server/jobs";
import { audit } from "@/lib/server/audit";

const MAX = 20 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png"]);

/** Upload of an existing СОР/СОЧ document. Stored privately, processed by a background job. */
export async function POST(request: Request) {
  const ctx = await getSessionContext();
  const membership = ctx?.memberships.find((m) => m.role === "teacher");
  if (!ctx || !membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await rateLimit(`doc:${ctx.userId}`, 30, 3600))) return NextResponse.json({ error: "rateLimited" }, { status: 429 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const hints = z.object({ subject: z.string().max(120).optional(), grade: z.coerce.number().int().min(1).max(12).optional() }).safeParse({
    subject: form?.get("subject") || undefined,
    grade: form?.get("grade") || undefined,
  });
  if (!(file instanceof File)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (file.size === 0 || file.size > MAX) return NextResponse.json({ error: "fileTooLarge" }, { status: 413 });
  const buf = new Uint8Array(await file.arrayBuffer());
  const type = detectFileType(buf);
  if (!type || !ALLOWED.has(type)) return NextResponse.json({ error: "fileType" }, { status: 415 });

  const supabase = await createClient();
  const path = `${membership.school_id}/${ctx.userId}/${randomUUID()}.${EXT[type]}`;
  const up = await supabase.storage.from("assessment-documents").upload(path, buf, { contentType: type, upsert: false });
  if (up.error) return NextResponse.json({ error: "uploadFailed" }, { status: 500 });
  const { data: job, error } = await supabase
    .from("ocr_jobs")
    .insert({
      school_id: membership.school_id,
      created_by: ctx.userId,
      storage_path: path,
      file_name: safeFileName(file.name),
      mime_type: type,
      size_bytes: file.size,
      hints: { ...(hints.success ? hints.data : {}), locale: ctx.profile.locale },
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "uploadFailed" }, { status: 500 });
  await audit({ actorId: ctx.userId, schoolId: membership.school_id, action: "document.uploaded", entityType: "ocr_job", entityId: job.id });
  after(() => runBackgroundJobs({ grading: 0, ocr: 1 }));
  return NextResponse.json({ id: job.id });
}
