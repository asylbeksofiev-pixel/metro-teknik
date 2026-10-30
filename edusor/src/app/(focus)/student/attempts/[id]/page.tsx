import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/i18n/format";
import { gradeAttempt } from "@/lib/server/grading-service";
import type { QuestionType, SnapshotQuestion } from "@/lib/assessment/schema";
import { AttemptRunner, type RunnerQuestion } from "@/components/attempt/attempt-runner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmt } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("student");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  let { data: attempt } = await supabase.from("attempts").select("*").eq("id", id).eq("student_id", ctx.userId).maybeSingle();
  if (!attempt) notFound();

  // A timed-out attempt is finalized by the server on first access.
  if (attempt.status === "in_progress" && attempt.deadline_at && new Date(attempt.deadline_at) <= new Date()) {
    await supabase.rpc("attempt_heartbeat", { p_attempt: id });
    const refreshed = await supabase.from("attempts").select("*").eq("id", id).single();
    attempt = refreshed.data ?? attempt;
    if (attempt.status === "submitted") await gradeAttempt(id).catch(() => undefined);
  }

  const { data: assessment } = await supabase.from("assessments").select("title, allow_navigation, lockdown_mode").eq("id", attempt.assessment_id).single();

  if (attempt.status === "submitted") {
    const { data: release } = await supabase.from("result_releases").select("attempt_id").eq("attempt_id", id).maybeSingle();
    const label = release ? d.status.released : attempt.grading_status === "graded" ? d.results.gradedNotReleased : d.results.pending;
    return (
      <div className="mx-auto mt-16 max-w-lg px-4">
        <div className="rounded-lg border border-border bg-surface p-8 text-center shadow-card">
          <CheckCircle2 className="mx-auto mb-3 size-10 text-success" />
          <h1 className="text-lg font-semibold">{attempt.submit_reason === "timeout" ? d.attempt.timeUpTitle : d.attempt.submittedTitle}</h1>
          <p className="mt-1 text-sm font-medium">{assessment?.title}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {attempt.submit_reason === "timeout" ? d.attempt.timeUpText : fmt(d.attempt.submittedText, { date: formatDateTime(attempt.submitted_at, locale) })}
          </p>
          <div className="mt-4"><Badge tone={release ? "success" : "info"}>{label}</Badge></div>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild variant="secondary"><Link href="/student/dashboard">{d.attempt.toDashboard}</Link></Button>
            {release && <Button asChild><Link href={`/student/results/${id}`}>{d.attempt.toResults}</Link></Button>}
          </div>
        </div>
      </div>
    );
  }

  const [{ data: snap }, { data: answers }, { data: files }] = await Promise.all([
    supabase.from("assessment_snapshots").select("questions, sections").eq("id", attempt.snapshot_id).single(),
    supabase.from("answers").select("question_id, response, client_seq, flagged").eq("attempt_id", id),
    supabase.from("submission_files").select("id, question_id, file_name").eq("attempt_id", id).order("created_at"),
  ]);
  const sections = new Map(((snap?.sections ?? []) as { id: string; title: string }[]).map((s) => [s.id, s.title]));
  const byId = new Map(((snap?.questions ?? []) as SnapshotQuestion[]).map((q) => [q.id, q]));
  const questions: RunnerQuestion[] = attempt.question_order.flatMap((qid) => {
    const q = byId.get(qid);
    return q ? [{ id: q.id, type: q.type as QuestionType, content: q.content, points: Number(q.points), sectionTitle: q.sectionId ? (sections.get(q.sectionId) ?? null) : null }] : [];
  });
  const fileMap: Record<string, { id: string; name: string }[]> = {};
  for (const f of files ?? []) (fileMap[f.question_id] ??= []).push({ id: f.id, name: f.file_name });

  return (
    <AttemptRunner
      attemptId={id}
      title={assessment?.title ?? ""}
      questions={questions}
      optionOrders={attempt.option_orders as Record<string, string[]>}
      initialAnswers={Object.fromEntries((answers ?? []).map((a) => [a.question_id, { response: a.response as Record<string, unknown>, seq: a.client_seq, flagged: a.flagged }]))}
      initialFiles={fileMap}
      deadlineAt={attempt.deadline_at}
      serverNow={new Date().toISOString()}
      allowNavigation={assessment?.allow_navigation ?? true}
      lockdown={assessment?.lockdown_mode ?? false}
      initialQuestionId={attempt.current_question_id}
    />
  );
}
