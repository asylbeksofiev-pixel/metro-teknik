import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import { studentStatus, type AttemptLite, type StudentAssessmentStatus } from "@/lib/assessment/status";

export type StudentAssessmentRow = {
  id: string;
  title: string;
  kind: "sor" | "soch";
  subject: { name_ru: string; name_kk: string } | null;
  starts_at: string | null;
  due_at: string | null;
  duration_minutes: number | null;
  status: StudentAssessmentStatus;
  canStart: boolean;
  latest: AttemptLite | null;
};

export async function studentAssessments(supabase: ServerClient, studentId: string): Promise<StudentAssessmentRow[]> {
  const [{ data: assessments }, { data: attempts }, { data: releases }, { data: accommodations }] = await Promise.all([
    supabase
      .from("assessments")
      .select("id, title, kind, status, starts_at, due_at, duration_minutes, max_attempts, subject:subjects(name_ru, name_kk)")
      .in("status", ["published", "closed"])
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("attempts").select("id, assessment_id, status, grading_status, attempt_no, submitted_at, deadline_at").eq("student_id", studentId),
    supabase.from("result_releases").select("attempt_id"),
    supabase.from("student_accommodations").select("assessment_id, extra_attempts").eq("student_id", studentId),
  ]);
  const released = new Set((releases ?? []).map((r) => r.attempt_id));
  const byAssessment = new Map<string, AttemptLite[]>();
  for (const t of attempts ?? []) {
    byAssessment.set(t.assessment_id, [...(byAssessment.get(t.assessment_id) ?? []), { ...t, released: released.has(t.id) }]);
  }
  return (assessments ?? []).map((a) => {
    const extra = (accommodations ?? []).filter((x) => !x.assessment_id || x.assessment_id === a.id).reduce((s, x) => s + x.extra_attempts, 0);
    const s = studentStatus(a, byAssessment.get(a.id) ?? [], extra);
    return { id: a.id, title: a.title, kind: a.kind, subject: a.subject, starts_at: a.starts_at, due_at: a.due_at, duration_minutes: a.duration_minutes, ...s };
  });
}
