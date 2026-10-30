import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { studentStatus } from "@/lib/assessment/status";
import { formatDateTime, subjectName } from "@/lib/i18n/format";
import { PageHeader, Alert } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/content/rich-text";
import { StartAttemptForm } from "@/components/attempt/start-form";
import { formatPoints } from "@/lib/utils";

export default async function Instructions({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("student");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("assessments")
    .select("id, title, kind, status, instructions, starts_at, due_at, duration_minutes, max_attempts, lockdown_mode, allow_navigation, current_snapshot_id, subject:subjects(name_ru, name_kk)")
    .eq("id", id)
    .maybeSingle();
  if (!a || !a.current_snapshot_id) notFound();
  const [{ data: snap }, { data: attempts }, { data: acc }] = await Promise.all([
    supabase.from("assessment_snapshots").select("questions, total_points").eq("id", a.current_snapshot_id).single(),
    supabase.from("attempts").select("id, status, grading_status, attempt_no, submitted_at, deadline_at").eq("assessment_id", id).eq("student_id", ctx.userId),
    supabase.from("student_accommodations").select("assessment_id, extra_attempts, extra_minutes").eq("student_id", ctx.userId),
  ]);
  const relevant = (acc ?? []).filter((x) => !x.assessment_id || x.assessment_id === id);
  const extraAttempts = relevant.reduce((s, x) => s + x.extra_attempts, 0);
  const extraMinutes = relevant.reduce((s, x) => s + x.extra_minutes, 0);
  const st = studentStatus(a, attempts ?? [], extraAttempts);
  const left = Math.max(0, a.max_attempts + extraAttempts - (attempts?.length ?? 0));
  const questionCount = (snap?.questions as unknown[] | undefined)?.length ?? 0;

  const facts: [string, string][] = [
    [d.common.subject, subjectName(a.subject, locale)],
    [d.attempt.duration, a.duration_minutes ? `${a.duration_minutes + extraMinutes} ${d.common.minutes}` : d.attempt.noLimit],
    [d.attempt.questionCount, String(questionCount)],
    [d.attempt.maxPoints, formatPoints(Number(snap?.total_points ?? 0))],
    [d.attempt.attemptsLeft, String(left)],
    [d.attempt.deadline, formatDateTime(a.due_at, locale)],
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={a.title} breadcrumb={<Link href="/student/assessments" className="hover:underline">{d.student.assessmentsTitle}</Link>} description={<Badge tone="primary">{d.assessment.kind[a.kind]}</Badge>} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title={d.attempt.instructionsTitle} />
          <CardBody className="flex flex-col gap-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {facts.map(([k, v]) => (
                <div key={k} className="rounded-md bg-muted/60 px-3 py-2.5">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {a.instructions && <RichText text={a.instructions} className="text-sm" />}
          </CardBody>
        </Card>

        {a.lockdown_mode && (
          <Card className="border-warning/40">
            <CardHeader title={<span className="flex items-center gap-2"><ShieldAlert className="size-5 text-warning" /> {d.lockdown.title}</span>} description={d.lockdown.intro} />
            <CardBody className="flex flex-col gap-3">
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                {d.lockdown.rules.map((r) => <li key={r}>{r}</li>)}
              </ul>
              <Alert tone="warning">{d.lockdown.disclaimer}</Alert>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardBody>
            {st.status === "in_progress" && st.latest ? (
              <Button asChild size="lg"><Link href={`/student/attempts/${st.latest.id}`}>{d.attempt.continue}</Link></Button>
            ) : st.canStart ? (
              <StartAttemptForm assessmentId={id} label={d.attempt.start} lockdown={a.lockdown_mode} />
            ) : (
              <Alert tone="info">{d.status[st.status]}{st.latest && st.status !== "expired" ? <> · <Link className="underline" href={`/student/attempts/${st.latest.id}`}>{d.common.view}</Link></> : null}</Alert>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
