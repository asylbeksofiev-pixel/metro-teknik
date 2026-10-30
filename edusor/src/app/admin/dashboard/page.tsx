import Link from "next/link";
import { GraduationCap, Users, UserSquare2, ClipboardList, CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { ActionButton } from "@/components/forms/action-button";
import { reviewTeacherRequestAction } from "@/lib/actions/admin";
import { formatDateTime } from "@/lib/i18n/format";

export default async function AdminDashboard() {
  const ctx = await requireRole("school_admin");
  const schoolId = ctx.schoolId!;
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const [teachers, students, classes, assessments, graded, { data: requests }, { data: events }] = await Promise.all([
    count(supabase.from("school_memberships").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("role", "teacher")),
    count(supabase.from("school_memberships").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("role", "student")),
    count(supabase.from("classes").select("id", { count: "exact", head: true }).eq("school_id", schoolId)),
    count(supabase.from("assessments").select("id", { count: "exact", head: true }).eq("school_id", schoolId).neq("status", "draft")),
    count(supabase.from("final_grades").select("attempt_id, assessments!inner(school_id)", { count: "exact", head: true }).eq("assessments.school_id", schoolId)),
    supabase.from("teacher_verification_requests").select("id, message, created_at, profile:profiles!teacher_verification_requests_user_id_fkey(full_name, email)").eq("school_id", schoolId).eq("status", "pending").order("created_at"),
    supabase.from("audit_events").select("id, action, created_at, actor:profiles(full_name)").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(10),
  ]);

  return (
    <>
      <PageHeader title={d.admin.dashboardTitle} description={ctx.memberships.find((m) => m.role === "school_admin")?.school?.name} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={d.admin.teachers} value={teachers} icon={UserSquare2} />
        <StatCard label={d.admin.students} value={students} icon={Users} tone="info" />
        <StatCard label={d.admin.classes} value={classes} icon={GraduationCap} tone="success" />
        <StatCard label={d.admin.assessmentsCount} value={assessments} icon={ClipboardList} tone="warning" />
        <StatCard label={d.admin.gradedCount} value={graded} icon={CheckCircle2} tone="success" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={d.admin.teacherRequests} />
          <CardBody className="p-0">
            {!requests?.length ? (
              <EmptyState title={d.admin.noRequests} />
            ) : (
              <ul className="divide-y divide-border">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{r.profile?.full_name || r.profile?.email}</p>
                      <p className="text-xs text-muted-foreground">{r.profile?.email} · {formatDateTime(r.created_at, locale)}</p>
                      {r.message && <p className="mt-1 text-[13px] text-muted-foreground">{r.message}</p>}
                    </div>
                    <div className="flex gap-2">
                      <ActionButton action={reviewTeacherRequestAction.bind(null, r.id, true)} variant="primary">{d.admin.approve}</ActionButton>
                      <ActionButton action={reviewTeacherRequestAction.bind(null, r.id, false)} variant="ghost">{d.admin.reject}</ActionButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={d.superAdmin.auditTitle} action={<Link href="/admin/reports" className="text-[13px] text-primary hover:underline">{d.nav.reports}</Link>} />
          <CardBody className="p-0">
            {!events?.length ? (
              <EmptyState title={d.common.noData} />
            ) : (
              <ul className="divide-y divide-border">
                {events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                    <span className="font-mono text-xs">{e.action}</span>
                    <span className="text-muted-foreground">{e.actor?.full_name ?? "—"} · {formatDateTime(e.created_at, locale)}</span>
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
