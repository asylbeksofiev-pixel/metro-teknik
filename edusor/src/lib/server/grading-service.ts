import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeResponse } from "@/lib/assessment/grading";
import type { QuestionType, SnapshotQuestion } from "@/lib/assessment/schema";
import { notifySubmission } from "./notify";
import { logSystemError } from "./audit";
import { aiConfigured } from "@/lib/ai/client";

/**
 * Deterministically grades a submitted attempt and queues AI suggestions for subjective answers.
 * Idempotent: re-running never overwrites scores a teacher has already approved.
 * Must only be called for attempts the caller has been verified to own or manage.
 */
export async function gradeAttempt(attemptId: string): Promise<{ needsReview: number }> {
  const admin = createAdminClient();
  const { data: attempt } = await admin.from("attempts").select("id, status, snapshot_id, question_order, grading_status").eq("id", attemptId).single();
  if (!attempt || attempt.status !== "submitted") return { needsReview: 0 };

  const [{ data: snapshot }, { data: keys }, { data: answers }, { data: existing }] = await Promise.all([
    admin.from("assessment_snapshots").select("questions").eq("id", attempt.snapshot_id).single(),
    admin.from("assessment_snapshot_keys").select("question_id, type, points, answer_key").eq("snapshot_id", attempt.snapshot_id),
    admin.from("answers").select("id, question_id, response").eq("attempt_id", attemptId),
    admin.from("question_scores").select("answer_id, approved_at").eq("attempt_id", attemptId),
  ]);
  const questions = new Map(((snapshot?.questions ?? []) as SnapshotQuestion[]).map((q) => [q.id, q]));
  const keyMap = new Map((keys ?? []).map((k) => [k.question_id, k]));
  const answerMap = new Map((answers ?? []).map((a) => [a.question_id, a]));
  const approved = new Set((existing ?? []).filter((e) => e.approved_at).map((e) => e.answer_id));

  // Every question gets an answer row (possibly empty) so it can carry a score.
  const missing = attempt.question_order.filter((qid) => !answerMap.has(qid));
  if (missing.length) {
    const { data: inserted } = await admin
      .from("answers")
      .upsert(missing.map((qid) => ({ attempt_id: attemptId, question_id: qid, response: {} })), { onConflict: "attempt_id,question_id" })
      .select("id, question_id, response");
    for (const a of inserted ?? []) answerMap.set(a.question_id, a);
  }

  let needsReview = 0;
  const rows = [];
  const reviewAnswerIds: string[] = [];
  for (const qid of attempt.question_order) {
    const key = keyMap.get(qid);
    const answer = answerMap.get(qid);
    if (!key || !answer || approved.has(answer.id)) continue;
    const max = Number(key.points);
    const g = gradeResponse(key.type as QuestionType, key.answer_key, answer.response, max, questions.get(qid)?.content);
    if (g.needsReview) {
      needsReview++;
      reviewAnswerIds.push(answer.id);
    }
    rows.push({
      answer_id: answer.id,
      attempt_id: attemptId,
      question_id: qid,
      max_points: max,
      auto_points: g.points,
      auto_result: g.result,
      final_points: g.needsReview ? null : g.points,
      final_result: g.needsReview ? null : g.result,
      needs_review: g.needsReview,
      updated_at: new Date().toISOString(),
    });
  }
  if (rows.length) {
    const { error } = await admin.from("question_scores").upsert(rows, { onConflict: "answer_id" });
    if (error) {
      await logSystemError("grading", error.message, { attemptId });
      throw new Error("grading_failed");
    }
  }

  if (reviewAnswerIds.length && aiConfigured()) await enqueueGradingJobs(attemptId, reviewAnswerIds);

  if (attempt.grading_status !== "graded") {
    await admin.from("attempts").update({ grading_status: needsReview > 0 ? "needs_review" : "pending" }).eq("id", attemptId);
  }
  if ((existing ?? []).length === 0) await notifySubmission(attemptId, needsReview > 0);
  return { needsReview };
}

/** Queues AI grading suggestions; skips answers that already have an open job. */
export async function enqueueGradingJobs(attemptId: string, answerIds: string[], requestedBy: string | null = null) {
  const admin = createAdminClient();
  const { data: open } = await admin.from("grading_jobs").select("answer_id").in("answer_id", answerIds).in("status", ["queued", "running"]);
  const busy = new Set((open ?? []).map((j) => j.answer_id));
  const rows = answerIds.filter((id) => !busy.has(id)).map((answer_id) => ({ attempt_id: attemptId, answer_id, requested_by: requestedBy }));
  if (!rows.length) return;
  const { error } = await admin.from("grading_jobs").insert(rows);
  // 23505: a concurrent request queued the same answer — the partial unique index keeps one open job.
  if (error && error.code !== "23505") await logSystemError("grading.enqueue", error.message, { attemptId });
}

/** Finds submitted attempts that were never graded (e.g. timeouts finalized by the sweeper) and grades them. */
export async function gradeUngradedAttempts(limit = 50): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("attempts")
    .select("id, question_scores(count)")
    .eq("status", "submitted")
    .eq("grading_status", "pending")
    .order("submitted_at", { ascending: false })
    .limit(limit * 4);
  const todo = (data ?? []).filter((t) => (t.question_scores[0]?.count ?? 0) === 0).slice(0, limit);
  for (const t of todo) {
    try {
      await gradeAttempt(t.id);
    } catch (e) {
      await logSystemError("grading", e instanceof Error ? e.message : String(e), { attemptId: t.id });
    }
  }
  return todo.length;
}
