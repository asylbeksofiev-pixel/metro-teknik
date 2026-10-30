import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import type { QuestionType, SnapshotQuestion } from "@/lib/assessment/schema";
import { mean, round1, topicPerformance } from "@/lib/analytics/stats";

export type GradeRow = {
  attemptId: string;
  studentId: string;
  assessmentId: string;
  title: string;
  kind: "sor" | "soch";
  subject: { name_ru: string; name_kk: string } | null;
  percent: number;
  score: number;
  max: number;
  feedback: string | null;
  date: string;
};

export type ScoreDetail = { attemptId: string; studentId: string; questionId: string; type: QuestionType; topic: string | null; points: number; max: number; feedback: string | null; date: string };

/**
 * Loads approved grades and per-question scores. For students, RLS returns only released rows;
 * for teachers, only assessments they manage. Nothing is inferred for missing data.
 */
export async function loadPerformance(supabase: ServerClient, filter: { studentIds?: string[]; assessmentIds?: string[] }) {
  let gq = supabase
    .from("final_grades")
    .select("attempt_id, student_id, assessment_id, score, max_score, percent, feedback, approved_at, assessment:assessments(title, kind, subject:subjects(name_ru, name_kk)), attempt:attempts(submitted_at, snapshot_id)");
  if (filter.studentIds) gq = gq.in("student_id", filter.studentIds.length ? filter.studentIds : ["00000000-0000-0000-0000-000000000000"]);
  if (filter.assessmentIds) gq = gq.in("assessment_id", filter.assessmentIds.length ? filter.assessmentIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: grades } = await gq;
  const rows: GradeRow[] = (grades ?? []).map((g) => ({
    attemptId: g.attempt_id,
    studentId: g.student_id,
    assessmentId: g.assessment_id,
    title: g.assessment?.title ?? "",
    kind: g.assessment?.kind ?? "sor",
    subject: g.assessment?.subject ?? null,
    percent: Number(g.percent),
    score: Number(g.score),
    max: Number(g.max_score),
    feedback: g.feedback,
    date: g.attempt?.submitted_at ?? g.approved_at,
  })).sort((a, b) => a.date.localeCompare(b.date));

  const attemptIds = rows.map((r) => r.attemptId);
  const snapshotIds = [...new Set((grades ?? []).flatMap((g) => (g.attempt?.snapshot_id ? [g.attempt.snapshot_id] : [])))];
  const [{ data: scores }, { data: snaps }] = await Promise.all([
    attemptIds.length ? supabase.from("question_scores").select("attempt_id, question_id, final_points, max_points, teacher_feedback").in("attempt_id", attemptIds).not("final_points", "is", null) : { data: [] },
    snapshotIds.length ? supabase.from("assessment_snapshots").select("id, questions").in("id", snapshotIds) : { data: [] },
  ]);
  const qMeta = new Map<string, SnapshotQuestion>();
  for (const s of snaps ?? []) for (const q of (s.questions ?? []) as SnapshotQuestion[]) qMeta.set(q.id, q);
  const byAttempt = new Map(rows.map((r) => [r.attemptId, r]));
  const details: ScoreDetail[] = (scores ?? []).flatMap((s) => {
    const g = byAttempt.get(s.attempt_id);
    const q = qMeta.get(s.question_id);
    if (!g || !q) return [];
    return [{ attemptId: s.attempt_id, studentId: g.studentId, questionId: s.question_id, type: q.type as QuestionType, topic: q.topic, points: Number(s.final_points), max: Number(s.max_points), feedback: s.teacher_feedback, date: g.date }];
  });
  return { grades: rows, details };
}

export function summarizeStudent(grades: GradeRow[], details: ScoreDetail[]) {
  const topics = topicPerformance(details);
  const percents = grades.map((g) => g.percent);
  const half = Math.floor(grades.length / 2);
  const early = mean(grades.slice(0, half).map((g) => g.percent));
  const late = mean(grades.slice(half).map((g) => g.percent));
  // Topic change: latest graded occurrence vs earlier ones, only for topics seen in ≥2 assessments.
  const topicChange = [...new Set(details.map((x) => x.topic).filter((t): t is string => !!t))].flatMap((topic) => {
    const attempts = [...new Set(details.filter((x) => x.topic === topic).map((x) => x.attemptId))];
    if (attempts.length < 2) return [];
    const pct = (ids: string[]) => {
      const rows = details.filter((x) => x.topic === topic && ids.includes(x.attemptId));
      const max = rows.reduce((s, r) => s + r.max, 0);
      return max ? (rows.reduce((s, r) => s + r.points, 0) / max) * 100 : null;
    };
    const last = attempts[attempts.length - 1]!;
    const before = pct(attempts.slice(0, -1));
    const now = pct([last]);
    return before === null || now === null ? [] : [{ topic, before: round1(before)!, now: round1(now)!, delta: round1(now - before)! }];
  });
  const byType = new Map<QuestionType, { earned: number; max: number; n: number }>();
  for (const x of details) {
    const t = byType.get(x.type) ?? { earned: 0, max: 0, n: 0 };
    t.earned += x.points;
    t.max += x.max;
    t.n++;
    byType.set(x.type, t);
  }
  return {
    average: round1(mean(percents)),
    trend: grades.length >= 2 && early !== null && late !== null ? round1(late - early) : null,
    topics,
    weak: topics.filter((t) => t.percent < 65 && t.responses >= 2),
    strong: topics.filter((t) => t.percent >= 85 && t.responses >= 2).reverse(),
    topicChange,
    mistakeTypes: [...byType.entries()].map(([type, t]) => ({ type, percent: round1((t.earned / t.max) * 100)!, responses: t.n })).filter((t) => t.responses >= 2 && t.percent < 65).sort((a, b) => a.percent - b.percent),
    responses: details.length,
  };
}
