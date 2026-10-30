export type StudentAssessmentStatus =
  | "upcoming"
  | "available"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "graded"
  | "released"
  | "expired"
  | "no_attempts";

export type AttemptLite = {
  id: string;
  status: "in_progress" | "submitted";
  grading_status: "pending" | "needs_review" | "graded";
  attempt_no: number;
  submitted_at: string | null;
  deadline_at: string | null;
  released?: boolean;
};

export type AssessmentLite = {
  status: "draft" | "published" | "closed" | "archived";
  starts_at: string | null;
  due_at: string | null;
  max_attempts: number;
};

/** Derives what a student should see for an assessment. Pure; `now` is injectable for tests. */
export function studentStatus(a: AssessmentLite, attempts: AttemptLite[], extraAttempts = 0, now = new Date()): { status: StudentAssessmentStatus; canStart: boolean; latest: AttemptLite | null } {
  const sorted = [...attempts].sort((x, y) => y.attempt_no - x.attempt_no);
  const latest = sorted[0] ?? null;
  const open =
    a.status === "published" &&
    (!a.starts_at || new Date(a.starts_at) <= now) &&
    (!a.due_at || new Date(a.due_at) > now);
  const remaining = a.max_attempts + extraAttempts - attempts.length;

  const active = sorted.find((t) => t.status === "in_progress");
  if (active) {
    const timedOut = active.deadline_at !== null && new Date(active.deadline_at) <= now;
    return { status: timedOut ? "submitted" : "in_progress", canStart: !timedOut, latest: active };
  }
  if (latest) {
    const s: StudentAssessmentStatus = latest.released ? "released" : latest.grading_status === "graded" ? "graded" : latest.grading_status === "needs_review" ? "under_review" : "submitted";
    return { status: s, canStart: open && remaining > 0, latest };
  }
  if (a.status === "published" && a.starts_at && new Date(a.starts_at) > now) return { status: "upcoming", canStart: false, latest: null };
  if (!open) return { status: "expired", canStart: false, latest: null };
  if (remaining <= 0) return { status: "no_attempts", canStart: false, latest: null };
  return { status: "available", canStart: true, latest: null };
}

export const STATUS_TONE: Record<StudentAssessmentStatus, "neutral" | "primary" | "success" | "warning" | "danger" | "info"> = {
  upcoming: "neutral",
  available: "primary",
  in_progress: "warning",
  submitted: "info",
  under_review: "info",
  graded: "success",
  released: "success",
  expired: "danger",
  no_attempts: "neutral",
};

export const STATUS_LABEL_KEY: Record<StudentAssessmentStatus, "upcoming" | "available" | "in_progress" | "submitted" | "under_review" | "graded" | "released" | "expired" | "no_attempts"> = {
  upcoming: "upcoming",
  available: "available",
  in_progress: "in_progress",
  submitted: "submitted",
  under_review: "under_review",
  graded: "graded",
  released: "released",
  expired: "expired",
  no_attempts: "no_attempts",
};
