import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type NotificationType =
  | "assessment_assigned"
  | "deadline_soon"
  | "submission_received"
  | "review_needed"
  | "assessment_graded"
  | "results_released"
  | "feedback_available"
  | "document_ready"
  | "document_failed";

type Row = { user_id: string; type: NotificationType; payload: Record<string, string>; link: string; dedupe_key: string };

/** Inserts notifications, silently skipping duplicates (same user + dedupe key). Never throws. */
async function insert(rows: Row[]) {
  if (!rows.length) return;
  const admin = createAdminClient();
  const { error } = await admin.from("notifications").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
  if (error) console.error("[notify]", error.message);
}

/** Students assigned (directly or through a class) to an assessment. */
export async function assignedStudentIds(assessmentId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: assignments } = await admin.from("assessment_assignments").select("class_id, student_id").eq("assessment_id", assessmentId);
  const ids = new Set<string>();
  const classIds: string[] = [];
  for (const a of assignments ?? []) {
    if (a.student_id) ids.add(a.student_id);
    if (a.class_id) classIds.push(a.class_id);
  }
  if (classIds.length) {
    const { data } = await admin.from("class_enrollments").select("student_id").in("class_id", classIds);
    for (const e of data ?? []) ids.add(e.student_id);
  }
  return [...ids];
}

/** Call only after the caller's permission on the assessment has been verified. */
export async function notifyAssessmentAssigned(assessmentId: string) {
  const admin = createAdminClient();
  const { data: a } = await admin.from("assessments").select("title, status").eq("id", assessmentId).single();
  if (!a || a.status !== "published") return;
  const students = await assignedStudentIds(assessmentId);
  await insert(
    students.map((user_id) => ({
      user_id,
      type: "assessment_assigned",
      payload: { title: a.title },
      link: `/student/assessments/${assessmentId}/instructions`,
      dedupe_key: `assigned:${assessmentId}`,
    })),
  );
}

export async function notifySubmission(attemptId: string, needsReview: boolean) {
  const admin = createAdminClient();
  const { data: t } = await admin.from("attempts").select("id, assessment:assessments(id, title, created_by), student:profiles(full_name)").eq("id", attemptId).single();
  if (!t?.assessment) return;
  await insert([
    {
      user_id: t.assessment.created_by,
      type: needsReview ? "review_needed" : "submission_received",
      payload: { title: t.assessment.title, student: t.student?.full_name ?? "" },
      link: `/teacher/submissions/${attemptId}/review`,
      dedupe_key: `submitted:${attemptId}`,
    },
  ]);
}

export async function notifyGraded(attemptIds: string[]) {
  const admin = createAdminClient();
  const { data } = await admin.from("attempts").select("id, student_id, assessment:assessments(title)").in("id", attemptIds);
  await insert(
    (data ?? []).map((t) => ({
      user_id: t.student_id,
      type: "assessment_graded",
      payload: { title: t.assessment?.title ?? "" },
      link: `/student/results`,
      dedupe_key: `graded:${t.id}`,
    })),
  );
}

export async function notifyReleased(attemptIds: string[]) {
  const admin = createAdminClient();
  const { data } = await admin.from("attempts").select("id, student_id, assessment:assessments(title)").in("id", attemptIds);
  await insert(
    (data ?? []).map((t) => ({
      user_id: t.student_id,
      type: "results_released",
      payload: { title: t.assessment?.title ?? "" },
      link: `/student/results/${t.id}`,
      dedupe_key: `released:${t.id}`,
    })),
  );
}

export async function notifyDocument(jobId: string, ok: boolean) {
  const admin = createAdminClient();
  const { data: job } = await admin.from("ocr_jobs").select("created_by, file_name").eq("id", jobId).single();
  if (!job) return;
  await insert([
    {
      user_id: job.created_by,
      type: ok ? "document_ready" : "document_failed",
      payload: { title: job.file_name },
      link: `/teacher/documents/${jobId}`,
      dedupe_key: `document:${jobId}:${ok ? "ok" : "fail"}`,
    },
  ]);
}

/** Reminds assigned students who have not submitted, ~24h before the deadline (run by the job runner). */
export async function notifyDeadlinesSoon() {
  const admin = createAdminClient();
  const now = Date.now();
  const { data: list } = await admin
    .from("assessments")
    .select("id, title, due_at")
    .eq("status", "published")
    .gt("due_at", new Date(now).toISOString())
    .lt("due_at", new Date(now + 24 * 3600 * 1000).toISOString());
  for (const a of list ?? []) {
    const students = await assignedStudentIds(a.id);
    const { data: submitted } = await admin.from("attempts").select("student_id").eq("assessment_id", a.id).eq("status", "submitted");
    const done = new Set((submitted ?? []).map((s) => s.student_id));
    await insert(
      students.filter((s) => !done.has(s)).map((user_id) => ({
        user_id,
        type: "deadline_soon",
        payload: { title: a.title },
        link: `/student/assessments/${a.id}/instructions`,
        dedupe_key: `deadline:${a.id}`,
      })),
    );
  }
}
