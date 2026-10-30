import Link from "next/link";
import { GraduationCap, Users, ClipboardList, Inbox, FileSearch, Plus } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { teacherClasses, teacherStudentIds } from "@/lib/data/teacher";
import { formatDateTime } from "@/lib/i18n/format";
import { PageHeader, StatCard, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmt, greetingName } from "@/lib/utils";

export default async function TeacherDashboard() {
  const ctx = await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const classes = await teacherClasses(supabase, ctx.userId);
  const studentIds = await teacherStudentIds(supabase, classes.map((c) => c.id));
  const nowIso = new Date().toISOString();

  const [{ count: active }, { count: pending }, { count: review }, { data: recent }, { data: upcoming }] = await Promise.all([
    supabase.from("assessments").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("attempts").select("id", { count: "exact", head: true }).eq("status", "submitted").neq("grading_status", "graded"),
    supabase.from("attempts").select("id", { count: "exact", head: true }).eq("status", "submitted").eq("grading_status", "needs_review"),
    supabase.from("attempts").select("id, submitted_at, grading_status, student:profiles(full_name), assessment:assessments(id, title)").eq("status", "submitted").order("submitted_at", { ascending: false }).limit(8),
    supabase.from("assessments").select("id, title, kind, due_at, class:classes(name)").eq("status", "published").gt("due_at", nowIso).order("due_at").limit(6),
  ]);

  return (
    <>
      <PageHeader
        title={fmt(d.teacher.welcome, { name: greetingName(ctx.profile.full_name) })}
        description={d.teacher.dashboardTitle}
        actions={<Button asChild><Link href="/teacher/assessments/new"><Plus /> {d.assessment.new}</Link></Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={d.teacher.stats.classes} value={classes.length} icon={GraduationCap} />
        <StatCard label={d.teacher.stats.students} value={studentIds.length} icon={Users} tone="info" />
        <StatCard label={d.teacher.stats.activeAssessments} value={active ?? 0} icon={ClipboardList} tone="success" />
        <StatCard label={d.teacher.stats.pendingSubmissions} value={pending ?? 0} icon={Inbox} tone="warning" />
        <StatCard label={d.teacher.stats.manualReview} value={review ?? 0} icon={FileSearch} tone="danger" />
      </div>
      {classes.length === 0 && <div className="mt-6 rounded-lg border border-dashed border-border bg-surface"><EmptyState icon={GraduationCap} title={d.teacher.noClasses} /></div>}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={d.teacher.recentActivity} />
          <CardBody className="p-0">
            {!recent?.length ? <EmptyState title={d.teacher.noActivity} /> : (
              <ul className="divide-y divide-border">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.student?.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.assessment?.title} · {formatDateTime(r.submitted_at, locale)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={r.grading_status === "graded" ? "success" : r.grading_status === "needs_review" ? "warning" : "info"}>{d.status[r.grading_status === "graded" ? "graded" : r.grading_status === "needs_review" ? "needs_review" : "pending"]}</Badge>
                      <Button asChild size="sm" variant="ghost"><Link href={`/teacher/submissions/${r.id}/review`}>{d.grading.review}</Link></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={d.teacher.upcomingDeadlines} />
          <CardBody className="p-0">
            {!upcoming?.length ? <EmptyState title={d.teacher.noDeadlines} /> : (
              <ul className="divide-y divide-border">
                {upcoming.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <Link href={`/teacher/assessments/${a.id}`} className="block truncate text-sm font-medium hover:underline">{a.title}</Link>
                      <p className="text-xs text-muted-foreground">{d.assessment.kind[a.kind]} · {a.class?.name ?? "—"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatDateTime(a.due_at, locale)}</span>
                      <Button asChild size="sm" variant="ghost"><Link href={`/teacher/assessments/${a.id}/live`}>{d.assessment.live}</Link></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
