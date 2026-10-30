import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, Inbox, Pencil, Radio } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { teacherClasses } from "@/lib/data/teacher";
import { formatDateTime, subjectName } from "@/lib/i18n/format";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SimpleForm } from "@/components/forms/simple-form";
import { ActionButton } from "@/components/forms/action-button";
import { PublishButton } from "@/components/assessments/lifecycle-buttons";
import { assignClassAction, assignStudentsAction, deleteDraftAction, removeAssignmentAction, setAssessmentStatusAction } from "@/lib/actions/assessments";
import { fmt, formatPoints } from "@/lib/utils";

export default async function AssessmentOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("assessments")
    .select("*, subject:subjects(name_ru, name_kk), class:classes(name), snapshot:assessment_snapshots!assessments_snapshot_fk(version, total_points, created_at)")
    .eq("id", id)
    .maybeSingle();
  if (!a) notFound();

  const [{ data: assignments }, { count: questionCount }, { data: attempts }, classes] = await Promise.all([
    supabase.from("assessment_assignments").select("id, class:classes(id, name), student:profiles(id, full_name)").eq("assessment_id", id),
    supabase.from("assessment_questions").select("id", { count: "exact", head: true }).eq("assessment_id", id),
    supabase.from("attempts").select("status, grading_status").eq("assessment_id", id),
    teacherClasses(supabase, ctx.userId),
  ]);
  const assignedClassIds = new Set((assignments ?? []).flatMap((x) => (x.class ? [x.class.id] : [])));
  const classIds = classes.map((c) => c.id);
  const { data: enrollable } = classIds.length
    ? await supabase.from("class_enrollments").select("class_id, student:profiles(id, full_name)").in("class_id", classIds)
    : { data: [] };
  const assignedStudentIds = new Set((assignments ?? []).flatMap((x) => (x.student ? [x.student.id] : [])));
  const studentOptions = [...new Map((enrollable ?? []).flatMap((e) => (e.student && !assignedStudentIds.has(e.student.id) ? [[e.student.id, e.student.full_name] as const] : []))).entries()]
    .sort((x, y) => x[1].localeCompare(y[1]))
    .map(([value, label]) => ({ value, label }));

  const inProgress = attempts?.filter((t) => t.status === "in_progress").length ?? 0;
  const submitted = attempts?.filter((t) => t.status === "submitted").length ?? 0;
  const review = attempts?.filter((t) => t.grading_status === "needs_review").length ?? 0;

  const settings: [string, string][] = [
    [d.assessment.kindLabel, d.assessment.kind[a.kind]],
    [d.common.subject, subjectName(a.subject, locale)],
    [d.assessment.startsAt, formatDateTime(a.starts_at, locale)],
    [d.assessment.dueAt, formatDateTime(a.due_at, locale)],
    [d.assessment.duration, a.duration_minutes ? `${a.duration_minutes} ${d.common.minutes}` : d.attempt.noLimit],
    [d.assessment.maxAttempts, String(a.max_attempts)],
    [d.assessment.lockdownMode, a.lockdown_mode ? d.common.yes : d.common.no],
    [d.assessment.releaseMode, a.release_mode === "manual" ? d.assessment.releaseManual : d.assessment.releaseOnApproval],
    [d.assessment.gradingProfile, d.assessment.profiles[a.grading_profile]],
  ];

  return (
    <>
      <PageHeader
        title={a.title}
        breadcrumb={<Link href="/teacher/assessments" className="hover:underline">{d.assessment.listTitle}</Link>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={a.status === "published" ? "success" : a.status === "draft" ? "neutral" : "info"}>{d.status[a.status]}</Badge>
            {a.snapshot && <span>{fmt(d.assessment.publishedVersion, { v: a.snapshot.version })} · {formatDateTime(a.snapshot.created_at, locale)}</span>}
          </span>
        }
        actions={
          <>
            <Button asChild variant="secondary"><Link href={`/teacher/assessments/${id}/edit`}><Pencil /> {d.common.edit}</Link></Button>
            {a.status === "draft" && <PublishButton assessmentId={id} republish={false} />}
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={d.assessment.questionCount} value={questionCount ?? 0} />
        <StatCard label={d.assessment.totalPoints} value={formatPoints(Number(a.snapshot?.total_points ?? 0)) || "—"} />
        <StatCard label={d.live.inProgress} value={inProgress} tone="warning" />
        <StatCard label={d.live.submitted} value={submitted} tone="success" hint={review ? fmt(d.grading.needsReviewCount, { n: review }) : undefined} />
      </div>

      {a.status !== "draft" && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="secondary"><Link href={`/teacher/assessments/${id}/live`}><Radio /> {d.assessment.live}</Link></Button>
          <Button asChild variant="secondary"><Link href={`/teacher/assessments/${id}/submissions`}><Inbox /> {d.assessment.submissions}</Link></Button>
          <Button asChild variant="secondary"><Link href={`/teacher/assessments/${id}/analytics`}><BarChart3 /> {d.assessment.analytics}</Link></Button>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={d.assessment.assignees} />
          <CardBody className="flex flex-col gap-4">
            {!assignments?.length ? <p className="text-[13px] text-muted-foreground">{d.assessment.noAssignees}</p> : (
              <ul className="flex flex-wrap gap-2">
                {assignments.map((x) => (
                  <li key={x.id} className="flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-3 pr-1 text-sm">
                    {x.class ? <b>{x.class.name}</b> : x.student?.full_name}
                    <ActionButton variant="ghost" className="h-6 px-2 text-xs" action={removeAssignmentAction.bind(null, id, x.id)}>{d.common.remove}</ActionButton>
                  </li>
                ))}
              </ul>
            )}
            {a.status !== "archived" && (
              <div className="flex flex-col gap-4">
                <SimpleForm
                  action={async (v) => { "use server"; return assignClassAction(id, v.classId ?? ""); }}
                  submitLabel={d.assessment.assignClass}
                  fields={[{ name: "classId", label: d.common.class, type: "select", required: true, options: classes.filter((c) => !assignedClassIds.has(c.id)).map((c) => ({ value: c.id, label: c.name })) }]}
                />
                {studentOptions.length > 0 && (
                  <SimpleForm
                    action={async (v) => { "use server"; return assignStudentsAction(id, [v.studentId ?? ""]); }}
                    submitLabel={d.assessment.assignStudents}
                    fields={[{ name: "studentId", label: d.common.student, type: "select", required: true, options: studentOptions }]}
                  />
                )}
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={d.assessment.settings} action={<Link href={`/teacher/assessments/${id}/edit`} className="text-[13px] text-primary hover:underline">{d.common.edit}</Link>} />
          <CardBody>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {settings.map(([k, v]) => (<Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></Fragment>))}
            </dl>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
              {a.status === "published" && <ActionButton action={setAssessmentStatusAction.bind(null, id, "closed")} confirm={{ title: d.assessment.close, description: d.assessment.closeConfirm }}>{d.assessment.close}</ActionButton>}
              {a.status === "closed" && <ActionButton action={setAssessmentStatusAction.bind(null, id, "published")}>{d.assessment.publish}</ActionButton>}
              {(a.status === "closed" || a.status === "published") && <ActionButton variant="ghost" action={setAssessmentStatusAction.bind(null, id, "archived")} confirm={{ title: d.assessment.archive }}>{d.assessment.archive}</ActionButton>}
              {a.status === "draft" && <ActionButton variant="danger" action={deleteDraftAction.bind(null, id)} confirm={{ title: d.assessment.deleteDraft, description: d.assessment.deleteConfirm, confirmLabel: d.common.delete }}>{d.assessment.deleteDraft}</ActionButton>}
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
