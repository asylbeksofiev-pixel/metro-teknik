"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, type ServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { audit } from "@/lib/server/audit";
import { notifyGraded, notifyReleased } from "@/lib/server/notify";
import { enqueueGradingJobs } from "@/lib/server/grading-service";
import { runBackgroundJobs } from "@/lib/server/jobs";
import { resultFromPoints } from "@/lib/assessment/grading";
import { aiConfigured } from "@/lib/ai/client";
import { fail, type ActionResult } from "./result";

const uuid = z.string().uuid();
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Loads a score row through RLS — succeeds only if the teacher may manage this attempt. */
async function readableScore(supabase: ServerClient, answerId: string) {
  const { data } = await supabase
    .from("question_scores")
    .select("answer_id, attempt_id, question_id, max_points, final_points, attempt:attempts(assessment_id, assessment:assessments(school_id))")
    .eq("answer_id", answerId)
    .maybeSingle();
  return data;
}

async function refreshAttemptStatus(attemptId: string) {
  const admin = createAdminClient();
  const [{ data: attempt }, { data: scores }] = await Promise.all([
    admin.from("attempts").select("grading_status").eq("id", attemptId).single(),
    admin.from("question_scores").select("final_points").eq("attempt_id", attemptId),
  ]);
  if (!attempt || attempt.grading_status === "graded") return;
  const open = (scores ?? []).some((s) => s.final_points === null);
  await admin.from("attempts").update({ grading_status: open ? "needs_review" : "pending" }).eq("id", attemptId);
}

/** Recomputes an already approved final grade after a score correction (keeps it approved, audited). */
async function recomputeFinalGrade(attemptId: string, actorId: string) {
  const admin = createAdminClient();
  const { data: fg } = await admin.from("final_grades").select("attempt_id").eq("attempt_id", attemptId).maybeSingle();
  if (!fg) return;
  const { data: scores } = await admin.from("question_scores").select("final_points, max_points").eq("attempt_id", attemptId);
  const score = round2((scores ?? []).reduce((s, x) => s + Number(x.final_points ?? 0), 0));
  const max = round2((scores ?? []).reduce((s, x) => s + Number(x.max_points), 0));
  await admin.from("final_grades").update({ score, max_score: max, percent: round2((score / max) * 100), approved_by: actorId, approved_at: new Date().toISOString() }).eq("attempt_id", attemptId);
}

const scoreSchema = z.object({
  answerId: uuid,
  points: z.number().min(0).max(100),
  feedback: z.string().max(5000).optional(),
  source: z.enum(["manual", "ai_accepted", "ai_edited"]),
  suggestionId: uuid.optional(),
  criterionScores: z.array(z.object({ criterionId: z.string().max(64), score: z.number().min(0).max(100) })).max(20).optional(),
});

export async function setQuestionScoreAction(input: z.input<typeof scoreSchema>): Promise<ActionResult> {
  const parsed = scoreSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const v = parsed.data;
  const ctx = await requireRole("teacher");
  const supabase = await createClient();
  const row = await readableScore(supabase, v.answerId);
  if (!row) return fail("forbidden");
  const max = Number(row.max_points);
  if (v.points > max) return fail("invalid");
  const points = round2(v.points);

  const admin = createAdminClient();
  const { error } = await admin
    .from("question_scores")
    .update({
      final_points: points,
      final_result: resultFromPoints(points, max),
      needs_review: false,
      teacher_feedback: v.feedback?.trim() || null,
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("answer_id", v.answerId);
  if (error) return fail("generic");
  await admin.from("teacher_reviews").insert({
    answer_id: v.answerId,
    attempt_id: row.attempt_id,
    reviewer_id: ctx.userId,
    source: v.source,
    previous_points: row.final_points,
    points,
    criterion_scores: v.criterionScores ?? null,
    feedback: v.feedback?.trim() || null,
    suggestion_id: v.suggestionId ?? null,
  });
  await refreshAttemptStatus(row.attempt_id);
  await recomputeFinalGrade(row.attempt_id, ctx.userId);
  await audit({ actorId: ctx.userId, schoolId: row.attempt?.assessment?.school_id ?? null, action: "grade.question_scored", entityType: "answer", entityId: v.answerId, metadata: { previous: row.final_points, points, source: v.source } });
  revalidatePath(`/teacher/submissions/${row.attempt_id}/review`);
  return { ok: true, data: undefined };
}

export async function requestAiSuggestionAction(answerId: string): Promise<ActionResult> {
  if (!uuid.safeParse(answerId).success) return fail("invalid");
  const ctx = await requireRole("teacher");
  if (!aiConfigured()) return fail("aiUnavailable");
  const supabase = await createClient();
  const row = await readableScore(supabase, answerId);
  if (!row) return fail("forbidden");
  await enqueueGradingJobs(row.attempt_id, [answerId], ctx.userId);
  after(() => runBackgroundJobs({ grading: 3, ocr: 0 }));
  revalidatePath(`/teacher/submissions/${row.attempt_id}/review`);
  return { ok: true, data: undefined };
}

async function approveOne(supabase: ServerClient, attemptId: string, actorId: string, feedback: string | null): Promise<"ok" | "forbidden" | "incomplete"> {
  const { data: attempt } = await supabase.from("attempts").select("id, status, assessment_id, student_id, assessment:assessments(school_id, release_mode)").eq("id", attemptId).maybeSingle();
  if (!attempt || attempt.status !== "submitted") return "forbidden";
  const { data: scores } = await supabase.from("question_scores").select("answer_id, final_points, max_points").eq("attempt_id", attemptId);
  if (!scores?.length || scores.some((s) => s.final_points === null)) return "incomplete";
  const score = round2(scores.reduce((s, x) => s + Number(x.final_points), 0));
  const max = round2(scores.reduce((s, x) => s + Number(x.max_points), 0));
  const admin = createAdminClient();
  const now = new Date().toISOString();
  // Auto-graded answers are approved together with the attempt.
  await admin.from("question_scores").update({ approved_by: actorId, approved_at: now }).eq("attempt_id", attemptId).is("approved_at", null);
  const { error } = await admin.from("final_grades").upsert(
    { attempt_id: attemptId, assessment_id: attempt.assessment_id, student_id: attempt.student_id, score, max_score: max, percent: round2((score / max) * 100), feedback, approved_by: actorId, approved_at: now },
    { onConflict: "attempt_id" },
  );
  if (error) return "forbidden";
  await admin.from("attempts").update({ grading_status: "graded" }).eq("id", attemptId);
  await audit({ actorId, schoolId: attempt.assessment?.school_id ?? null, action: "grade.approved", entityType: "attempt", entityId: attemptId, metadata: { score, max } });
  if (attempt.assessment?.release_mode === "on_approval") await release([attemptId], attempt.assessment_id, actorId, attempt.assessment.school_id);
  else await notifyGraded([attemptId]);
  return "ok";
}

async function release(attemptIds: string[], assessmentId: string, actorId: string, schoolId: string | null) {
  if (!attemptIds.length) return 0;
  const admin = createAdminClient();
  const { data } = await admin
    .from("result_releases")
    .upsert(attemptIds.map((attempt_id) => ({ attempt_id, assessment_id: assessmentId, released_by: actorId })), { onConflict: "attempt_id", ignoreDuplicates: true })
    .select("attempt_id");
  const released = (data ?? []).map((r) => r.attempt_id);
  if (released.length) {
    await notifyReleased(released);
    await audit({ actorId, schoolId, action: "results.released", entityType: "assessment", entityId: assessmentId, metadata: { count: released.length } });
  }
  return released.length;
}

export async function approveAttemptAction(attemptId: string, feedback: string): Promise<ActionResult> {
  if (!uuid.safeParse(attemptId).success) return fail("invalid");
  const ctx = await requireRole("teacher");
  const supabase = await createClient();
  const res = await approveOne(supabase, attemptId, ctx.userId, feedback.trim().slice(0, 5000) || null);
  if (res !== "ok") return fail(res === "incomplete" ? "cannotApprove" : "forbidden");
  revalidatePath(`/teacher/submissions/${attemptId}/review`);
  return { ok: true, data: undefined };
}

/** Approves every submitted attempt whose questions were all graded automatically. */
export async function approveAllAutoAction(assessmentId: string): Promise<ActionResult<{ approved: number }>> {
  if (!uuid.safeParse(assessmentId).success) return fail("invalid");
  const ctx = await requireRole("teacher");
  const supabase = await createClient();
  const { data: attempts } = await supabase.from("attempts").select("id").eq("assessment_id", assessmentId).eq("status", "submitted").eq("grading_status", "pending");
  let approved = 0;
  for (const t of attempts ?? []) if ((await approveOne(supabase, t.id, ctx.userId, null)) === "ok") approved++;
  revalidatePath(`/teacher/assessments/${assessmentId}/submissions`);
  return { ok: true, data: { approved } };
}

/** Releases approved results to students (all approved attempts, or the given ones). Idempotent. */
export async function releaseResultsAction(assessmentId: string, attemptIds?: string[]): Promise<ActionResult<{ released: number }>> {
  if (!uuid.safeParse(assessmentId).success || (attemptIds && !z.array(uuid).max(1000).safeParse(attemptIds).success)) return fail("invalid");
  const ctx = await requireRole("teacher");
  const supabase = await createClient();
  const { data: a } = await supabase.from("assessments").select("id, school_id").eq("id", assessmentId).maybeSingle();
  if (!a) return fail("forbidden");
  let query = supabase.from("final_grades").select("attempt_id").eq("assessment_id", assessmentId);
  if (attemptIds) query = query.in("attempt_id", attemptIds);
  const { data: grades } = await query;
  const released = await release((grades ?? []).map((g) => g.attempt_id), assessmentId, ctx.userId, a.school_id);
  revalidatePath(`/teacher/assessments/${assessmentId}/submissions`);
  for (const id of attemptIds ?? []) revalidatePath(`/teacher/submissions/${id}/review`);
  return { ok: true, data: { released } };
}
