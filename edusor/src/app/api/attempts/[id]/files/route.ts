import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { attemptRouteContext } from "@/lib/server/attempt-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectFileType, EXT, safeFileName } from "@/lib/server/files";
import { rateLimit } from "@/lib/server/rate-limit";

const MAX = 10 * 1024 * 1024;

/** Verifies (as the student, through RLS) that the attempt is theirs, in progress and contains the question. */
async function ownedOpenAttempt(ctx: Exclude<Awaited<ReturnType<typeof attemptRouteContext>>, { error: unknown }>, questionId: string) {
  const { data } = await ctx.supabase.from("attempts").select("id, status, deadline_at, question_order, student_id").eq("id", ctx.id).maybeSingle();
  if (!data || data.student_id !== ctx.user.id) return "forbidden";
  if (data.status !== "in_progress" || (data.deadline_at && new Date(data.deadline_at).getTime() + 10_000 < Date.now())) return "locked";
  if (!data.question_order.includes(questionId)) return "invalid";
  return null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await attemptRouteContext(params);
  if ("error" in ctx) return ctx.error;
  if (!(await rateLimit(`upload:${ctx.user.id}`, 40, 3600))) return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const questionId = String(form?.get("questionId") ?? "");
  if (!(file instanceof File) || !z.string().uuid().safeParse(questionId).success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const problem = await ownedOpenAttempt(ctx, questionId);
  if (problem) return NextResponse.json({ error: problem }, { status: problem === "forbidden" ? 403 : 409 });
  if (file.size === 0 || file.size > MAX) return NextResponse.json({ error: "fileTooLarge" }, { status: 413 });
  const buf = new Uint8Array(await file.arrayBuffer());
  const type = detectFileType(buf);
  if (!type || type === "image/webp") return NextResponse.json({ error: "fileType" }, { status: 415 });

  const admin = createAdminClient();
  const { count } = await admin.from("submission_files").select("id", { count: "exact", head: true }).eq("attempt_id", ctx.id).eq("question_id", questionId);
  if ((count ?? 0) >= 5) return NextResponse.json({ error: "invalid" }, { status: 409 });
  const path = `${ctx.id}/${questionId}/${randomUUID()}.${EXT[type]}`;
  const up = await admin.storage.from("submissions").upload(path, buf, { contentType: type, upsert: false });
  if (up.error) return NextResponse.json({ error: "uploadFailed" }, { status: 500 });
  const { data, error } = await admin
    .from("submission_files")
    .insert({ attempt_id: ctx.id, question_id: questionId, storage_path: path, file_name: safeFileName(file.name), mime_type: type, size_bytes: file.size })
    .select("id, file_name")
    .single();
  if (error) {
    await admin.storage.from("submissions").remove([path]);
    return NextResponse.json({ error: "uploadFailed" }, { status: 500 });
  }
  return NextResponse.json({ id: data.id, name: data.file_name });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await attemptRouteContext(params);
  if ("error" in ctx) return ctx.error;
  const fileId = new URL(request.url).searchParams.get("fileId") ?? "";
  if (!z.string().uuid().safeParse(fileId).success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { data: file } = await ctx.supabase.from("submission_files").select("id, question_id, storage_path").eq("id", fileId).eq("attempt_id", ctx.id).maybeSingle();
  if (!file) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const problem = await ownedOpenAttempt(ctx, file.question_id);
  if (problem) return NextResponse.json({ error: problem }, { status: 409 });
  const admin = createAdminClient();
  await admin.from("submission_files").delete().eq("id", fileId);
  await admin.storage.from("submissions").remove([file.storage_path]);
  return NextResponse.json({ ok: true });
}
