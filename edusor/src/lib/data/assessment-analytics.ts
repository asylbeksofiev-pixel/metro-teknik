import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import type { QuestionType, Rubric, SnapshotQuestion } from "@/lib/assessment/schema";
import { describeResponse } from "@/lib/assessment/describe";
import { distribution, mean, median, optionDistribution, questionStats, round1, type QuestionStats, type ScoreRow } from "@/lib/analytics/stats";

export type QuestionAnalytics = {
  id: string;
  index: number;
  type: QuestionType;
  prompt: string;
  content: Record<string, unknown>;
  maxPoints: number;
  topic: string | null;
  stats: QuestionStats;
  options: { id: string; text: string; count: number; share: number; correct: boolean }[] | null;
  mostCommonWrong: { id: string; text: string; share: number } | null;
  rubric: { id: string; title: string; max: number; avg: number | null; n: number }[];
  patterns: { text: string; count: number }[];
  responses: { attemptId: string; student: string; text: string; points: number | null }[];
};

export type AssessmentAnalytics = {
  title: string;
  assigned: number;
  participants: number;
  approved: number;
  scores: { avg: number | null; median: number | null; min: number | null; max: number | null };
  avgSeconds: number | null;
  distribution: { bucket: string; count: number }[];
  questions: QuestionAnalytics[];
  students: { name: string; score: number | null; max: number | null; percent: number | null; submittedAt: string | null }[];
};

/** All figures are computed from stored rows visible to the teacher through RLS. */
export async function loadAssessmentAnalytics(supabase: ServerClient, assessmentId: string): Promise<AssessmentAnalytics | null> {
  const { data: a } = await supabase.from("assessments").select("id, title, current_snapshot_id").eq("id", assessmentId).maybeSingle();
  if (!a?.current_snapshot_id) return null;

  const [{ data: snap }, { data: keys }, { data: attempts }, { data: grades }, { data: assignments }] = await Promise.all([
    supabase.from("assessment_snapshots").select("questions").eq("id", a.current_snapshot_id).single(),
    supabase.from("assessment_snapshot_keys").select("question_id, answer_key, rubric").eq("snapshot_id", a.current_snapshot_id),
    supabase.from("attempts").select("id, student_id, started_at, submitted_at, student:profiles(full_name)").eq("assessment_id", assessmentId).eq("status", "submitted"),
    supabase.from("final_grades").select("attempt_id, score, max_score, percent").eq("assessment_id", assessmentId),
    supabase.from("assessment_assignments").select("class_id, student_id").eq("assessment_id", assessmentId),
  ]);
  const attemptIds = (attempts ?? []).map((t) => t.id);
  const classIds = (assignments ?? []).flatMap((x) => (x.class_id ? [x.class_id] : []));
  const [{ data: scores }, { data: answers }, { data: reviews }, { data: enrolled }] = await Promise.all([
    attemptIds.length ? supabase.from("question_scores").select("answer_id, attempt_id, question_id, max_points, auto_points, auto_result, final_points, final_result").in("attempt_id", attemptIds) : { data: [] },
    attemptIds.length ? supabase.from("answers").select("id, attempt_id, question_id, response").in("attempt_id", attemptIds) : { data: [] },
    attemptIds.length ? supabase.from("teacher_reviews").select("answer_id, criterion_scores, created_at").in("attempt_id", attemptIds).not("criterion_scores", "is", null).order("created_at", { ascending: false }) : { data: [] },
    classIds.length ? supabase.from("class_enrollments").select("student_id").in("class_id", classIds) : { data: [] },
  ]);

  const assigned = new Set<string>([...(enrolled ?? []).map((e) => e.student_id), ...(assignments ?? []).flatMap((x) => (x.student_id ? [x.student_id] : []))]);
  const latestAttempt = new Map<string, NonNullable<typeof attempts>[number]>();
  for (const t of attempts ?? []) {
    const prev = latestAttempt.get(t.student_id);
    if (!prev || (t.submitted_at ?? "") > (prev.submitted_at ?? "")) latestAttempt.set(t.student_id, t);
  }
  const counted = new Set([...latestAttempt.values()].map((t) => t.id));
  const gradeOf = new Map((grades ?? []).map((g) => [g.attempt_id, g]));
  const percents = [...counted].flatMap((id) => (gradeOf.has(id) ? [Number(gradeOf.get(id)!.percent)] : []));
  const durations = [...latestAttempt.values()].flatMap((t) => (t.submitted_at ? [(new Date(t.submitted_at).getTime() - new Date(t.started_at).getTime()) / 1000] : []));
  const nameOf = new Map((attempts ?? []).map((t) => [t.id, t.student?.full_name ?? "—"]));
  const answerOf = new Map((answers ?? []).map((x) => [x.id, x]));
  const latestReview = new Map<string, { criterionId: string; score: number }[]>();
  for (const r of reviews ?? []) if (!latestReview.has(r.answer_id)) latestReview.set(r.answer_id, (r.criterion_scores as { criterionId: string; score: number }[]) ?? []);

  const keyOf = new Map((keys ?? []).map((k) => [k.question_id, k]));
  const questions: QuestionAnalytics[] = ((snap?.questions ?? []) as SnapshotQuestion[]).map((q, i) => {
    const qScores = (scores ?? []).filter((s) => s.question_id === q.id && counted.has(s.attempt_id));
    const rows: ScoreRow[] = qScores.map((s) => ({
      result: (s.final_result ?? s.auto_result) as ScoreRow["result"],
      points: s.final_points !== null ? Number(s.final_points) : s.auto_points !== null && s.auto_result !== "pending" ? Number(s.auto_points) : null,
      max: Number(s.max_points),
    }));
    const key = keyOf.get(q.id);
    const type = q.type as QuestionType;
    let options: QuestionAnalytics["options"] = null;
    let mostCommonWrong: QuestionAnalytics["mostCommonWrong"] = null;
    let commonWrongShare = 0;
    if (type === "single_choice" || type === "multiple_choice" || type === "true_false") {
      const opts = type === "true_false" ? [{ id: "true", text: "true" }, { id: "false", text: "false" }] : ((q.content.options as { id: string; text: string }[]) ?? []);
      const ak = (key?.answer_key ?? {}) as { correct?: string | string[] | boolean | null };
      const correct = type === "true_false" ? (typeof ak.correct === "boolean" ? [String(ak.correct)] : []) : Array.isArray(ak.correct) ? ak.correct : ak.correct ? [String(ak.correct)] : [];
      const picks = qScores.map((s) => {
        const r = (answerOf.get(s.answer_id)?.response ?? {}) as { optionId?: string; optionIds?: string[]; value?: boolean };
        return type === "multiple_choice" ? (r.optionIds ?? []) : type === "true_false" ? (typeof r.value === "boolean" ? [String(r.value)] : []) : r.optionId ? [r.optionId] : [];
      });
      const dist = optionDistribution(opts, picks, correct);
      options = dist.rows.map((r) => ({ ...r, text: opts.find((o) => o.id === r.id)!.text }));
      if (dist.mostCommonWrong) {
        mostCommonWrong = { id: dist.mostCommonWrong.id, text: opts.find((o) => o.id === dist.mostCommonWrong!.id)!.text, share: dist.mostCommonWrong.share };
        commonWrongShare = dist.mostCommonWrong.share;
      }
    }
    const rubricDef = (key?.rubric as Rubric | null)?.criteria ?? [];
    const rubric = rubricDef.map((c) => {
      const vals = qScores.flatMap((s) => latestReview.get(s.answer_id)?.filter((x) => x.criterionId === c.id).map((x) => x.score) ?? []);
      const avg = mean(vals);
      return { id: c.id, title: c.title, max: c.maxPoints, avg: round1(avg), n: vals.length };
    });
    const rubricEarned = rubric.reduce((s, r) => s + (r.avg ?? 0), 0);
    const rubricMax = rubric.filter((r) => r.n > 0).reduce((s, r) => s + r.max, 0);
    const responses = qScores.map((s) => ({
      attemptId: s.attempt_id,
      student: nameOf.get(s.attempt_id) ?? "—",
      text: describeResponse(type, q.content, answerOf.get(s.answer_id)?.response ?? {}),
      points: s.final_points !== null ? Number(s.final_points) : null,
    }));
    const patterns =
      type === "short_text" || type === "numeric" || type === "fill_blanks"
        ? [...responses.reduce((m, r) => (r.text.trim() ? m.set(r.text.trim().toLowerCase(), (m.get(r.text.trim().toLowerCase()) ?? 0) + 1) : m), new Map<string, number>()).entries()]
            .map(([text, count]) => ({ text, count }))
            .sort((x, y) => y.count - x.count)
            .slice(0, 5)
        : [];
    return {
      id: q.id,
      index: i + 1,
      type,
      prompt: String(q.content.prompt ?? ""),
      content: q.content,
      maxPoints: Number(q.points),
      topic: q.topic,
      stats: questionStats(rows, { commonWrongShare, rubricShare: rubricMax > 0 ? rubricEarned / rubricMax : null }),
      options,
      mostCommonWrong,
      rubric,
      patterns,
      responses,
    };
  });

  return {
    title: a.title,
    assigned: assigned.size,
    participants: latestAttempt.size,
    approved: percents.length,
    scores: {
      avg: round1(mean(percents)),
      median: round1(median(percents)),
      min: percents.length ? round1(Math.min(...percents)) : null,
      max: percents.length ? round1(Math.max(...percents)) : null,
    },
    avgSeconds: mean(durations),
    distribution: distribution(percents),
    questions,
    students: [...latestAttempt.values()]
      .map((t) => {
        const g = gradeOf.get(t.id);
        return { name: t.student?.full_name ?? "—", score: g ? Number(g.score) : null, max: g ? Number(g.max_score) : null, percent: g ? Number(g.percent) : null, submittedAt: t.submitted_at };
      })
      .sort((x, y) => x.name.localeCompare(y.name)),
  };
}
