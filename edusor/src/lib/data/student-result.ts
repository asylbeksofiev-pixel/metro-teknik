import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import type { QuestionType, Rubric, SnapshotQuestion } from "@/lib/assessment/schema";

/** Loads a released result for the signed-in student. Returns null if not released (RLS enforces). */
export async function loadStudentResult(supabase: ServerClient, studentId: string, attemptId: string) {
  const { data: t } = await supabase
    .from("attempts")
    .select("id, snapshot_id, question_order, submitted_at, assessment:assessments(title, kind, show_correct_answers, allow_ai_explanations, allow_ai_followup, allow_practice)")
    .eq("id", attemptId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (!t?.assessment) return null;
  const { data: release } = await supabase.from("result_releases").select("released_at").eq("attempt_id", attemptId).maybeSingle();
  if (!release) return { attempt: t, released: false as const };
  const [{ data: grade }, { data: snap }, { data: answers }, { data: scores }, { data: keys }, { data: chats }] = await Promise.all([
    supabase.from("final_grades").select("score, max_score, percent, feedback").eq("attempt_id", attemptId).single(),
    supabase.from("assessment_snapshots").select("questions").eq("id", t.snapshot_id).single(),
    supabase.from("answers").select("id, question_id, response").eq("attempt_id", attemptId),
    supabase.from("question_scores").select("answer_id, question_id, final_points, final_result, max_points, teacher_feedback").eq("attempt_id", attemptId),
    supabase.from("assessment_snapshot_keys").select("question_id, answer_key, rubric, explanation").eq("snapshot_id", t.snapshot_id),
    supabase.from("ai_explanations").select("answer_id, locale, messages").eq("student_id", studentId),
  ]);
  const byQ = new Map(((snap?.questions ?? []) as SnapshotQuestion[]).map((q) => [q.id, q]));
  const keyOf = new Map((keys ?? []).map((k) => [k.question_id, k]));
  const answerOf = new Map((answers ?? []).map((a) => [a.question_id, a]));
  const scoreOf = new Map((scores ?? []).map((s) => [s.question_id, s]));
  const items = ((snap?.questions ?? []) as SnapshotQuestion[])
    .filter((q) => t.question_order.includes(q.id))
    .map((q, i) => {
      const a = answerOf.get(q.id);
      const s = scoreOf.get(q.id);
      const k = keyOf.get(q.id);
      return {
        index: i + 1,
        questionId: q.id,
        answerId: a?.id ?? null,
        type: q.type as QuestionType,
        content: q.content,
        topic: q.topic,
        response: (a?.response ?? {}) as Record<string, unknown>,
        points: s?.final_points === null || s?.final_points === undefined ? null : Number(s.final_points),
        max: Number(s?.max_points ?? q.points),
        result: (s?.final_result ?? "pending") as string,
        feedback: s?.teacher_feedback ?? null,
        key: k ? { answerKey: k.answer_key, rubric: (k.rubric as Rubric | null) ?? null, explanation: k.explanation } : null,
        chats: (chats ?? []).filter((c) => c.answer_id === a?.id),
      };
    });
  return { attempt: t, released: true as const, grade, items };
}
