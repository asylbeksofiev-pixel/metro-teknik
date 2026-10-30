"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { gradeAttempt } from "@/lib/server/grading-service";
import { audit } from "@/lib/server/audit";
import { dbErrorCode, fail, type ActionResult } from "./result";

export type LiveRow = {
  studentId: string;
  name: string;
  attemptId: string | null;
  status: "not_started" | "in_progress" | "submitted" | "expired";
  answered: number;
  total: number;
  currentIndex: number | null;
  deadlineAt: string | null;
  lastSeenAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  submitReason: string | null;
  events: number;
};

export type LiveData = { rows: LiveRow[]; serverNow: string; dueAt: string | null };

const uuid = z.string().uuid();

/** Live snapshot of an assessment. Contains no answers, keys or scores. */
export async function liveDataAction(assessmentId: string): Promise<ActionResult<LiveData>> {
  if (!uuid.safeParse(assessmentId).success) return fail("invalid");
  await requireRole("teacher");
  const supabase = await createClient();
  const { data: a } = await supabase.from("assessments").select("id, due_at").eq("id", assessmentId).maybeSingle();
  if (!a) return fail("forbidden");

  const [{ data: assignments }, { data: attempts }] = await Promise.all([
    supabase.from("assessment_assignments").select("class_id, student:profiles(id, full_name)").eq("assessment_id", assessmentId),
    supabase
      .from("attempts")
      .select("id, student_id, status, attempt_no, answered_count, question_order, current_question_id, deadline_at, last_seen_at, started_at, submitted_at, submit_reason, lockdown_event_count, student:profiles(full_name)")
      .eq("assessment_id", assessmentId)
      .order("attempt_no", { ascending: false }),
  ]);
  const classIds = (assignments ?? []).flatMap((x) => (x.class_id ? [x.class_id] : []));
  const { data: enrolled } = classIds.length ? await supabase.from("class_enrollments").select("student:profiles(id, full_name)").in("class_id", classIds) : { data: [] };

  const students = new Map<string, string>();
  for (const x of assignments ?? []) if (x.student) students.set(x.student.id, x.student.full_name);
  for (const e of enrolled ?? []) if (e.student) students.set(e.student.id, e.student.full_name);
  const latest = new Map<string, NonNullable<typeof attempts>[number]>();
  for (const t of attempts ?? []) {
    if (!latest.has(t.student_id)) latest.set(t.student_id, t);
    if (!students.has(t.student_id)) students.set(t.student_id, t.student?.full_name ?? "—");
  }

  const now = new Date();
  const rows: LiveRow[] = [...students.entries()].map(([studentId, name]) => {
    const t = latest.get(studentId);
    if (!t) {
      const expired = !!a.due_at && new Date(a.due_at) <= now;
      return { studentId, name, attemptId: null, status: expired ? "expired" : "not_started", answered: 0, total: 0, currentIndex: null, deadlineAt: null, lastSeenAt: null, startedAt: null, submittedAt: null, submitReason: null, events: 0 };
    }
    const timedOut = t.status === "in_progress" && !!t.deadline_at && new Date(t.deadline_at) <= now;
    return {
      studentId,
      name,
      attemptId: t.id,
      status: t.status === "submitted" ? (t.submit_reason === "timeout" ? "expired" : "submitted") : timedOut ? "expired" : "in_progress",
      answered: t.answered_count,
      total: t.question_order.length,
      currentIndex: t.current_question_id ? t.question_order.indexOf(t.current_question_id) : null,
      deadlineAt: t.deadline_at,
      lastSeenAt: t.last_seen_at,
      startedAt: t.started_at,
      submittedAt: t.submitted_at,
      submitReason: t.submit_reason,
      events: t.lockdown_event_count,
    };
  });
  rows.sort((x, y) => x.name.localeCompare(y.name));
  return { ok: true, data: { rows, serverNow: now.toISOString(), dueAt: a.due_at } };
}

export type AttemptDetail = {
  events: { id: string; type: string; occurredAt: string; durationMs: number | null }[];
  unanswered: number[];
};

export async function attemptDetailAction(attemptId: string): Promise<ActionResult<AttemptDetail>> {
  if (!uuid.safeParse(attemptId).success) return fail("invalid");
  await requireRole("teacher");
  const supabase = await createClient();
  const [{ data: t }, { data: events }, { data: answers }] = await Promise.all([
    supabase.from("attempts").select("question_order").eq("id", attemptId).maybeSingle(),
    supabase.from("lockdown_events").select("id, event_type, occurred_at, duration_ms").eq("attempt_id", attemptId).order("occurred_at"),
    supabase.from("answers").select("question_id, response").eq("attempt_id", attemptId),
  ]);
  if (!t) return fail("forbidden");
  const answered = new Set((answers ?? []).filter((a) => a.response && Object.keys(a.response as object).length > 0).map((a) => a.question_id));
  return {
    ok: true,
    data: {
      events: (events ?? []).map((e) => ({ id: e.id, type: e.event_type, occurredAt: e.occurred_at, durationMs: e.duration_ms })),
      unanswered: t.question_order.flatMap((qid, i) => (answered.has(qid) ? [] : [i + 1])),
    },
  };
}

/** Teacher ends a student's attempt (e.g. technical problem). Saved answers are submitted as-is. */
export async function forceSubmitAction(attemptId: string): Promise<ActionResult> {
  if (!uuid.safeParse(attemptId).success) return fail("invalid");
  const ctx = await requireRole("teacher");
  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_attempt", { p_attempt: attemptId, p_reason: "teacher" });
  if (error) return fail(dbErrorCode(error));
  await gradeAttempt(attemptId).catch(() => undefined);
  await audit({ actorId: ctx.userId, schoolId: ctx.schoolId, action: "attempt.force_submitted", entityType: "attempt", entityId: attemptId });
  return { ok: true, data: undefined };
}
