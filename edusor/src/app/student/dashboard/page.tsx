import Link from "next/link";
import { ClipboardList, Trophy } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { studentAssessments } from "@/lib/data/student";
import { formatDate, subjectName } from "@/lib/i18n/format";
import { PageHeader, EmptyState, ProgressBar } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StudentAssessmentCard } from "@/components/student/assessment-card";
import { fmt, formatPoints, greetingName } from "@/lib/utils";

export default async function StudentDashboard() {
  const ctx = await requireRole("student");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const [rows, { data: classes }, { data: grades }] = await Promise.all([
    studentAssessments(supabase, ctx.userId),
    supabase.from("class_enrollments").select("class:classes(id, name, grade)").eq("student_id", ctx.userId),
    supabase.from("final_grades").select("attempt_id, score, max_score, percent, approved_at, assessment:assessments(title, kind, subject:subjects(name_ru, name_kk))").eq("student_id", ctx.userId).order("approved_at", { ascending: false }).limit(5),
  ]);
  const inProgress = rows.filter((r) => r.status === "in_progress");
  const toDo = rows.filter((r) => r.status === "available");
  const upcoming = rows.filter((r) => r.status === "upcoming");
  const done = rows.filter((r) => ["submitted", "under_review", "graded", "released"].includes(r.status));
  const avg = grades?.length ? Math.round(grades.reduce((s, g) => s + Number(g.percent), 0) / grades.length) : null;

  return (
    <>
      <PageHeader title={fmt(d.student.welcome, { name: greetingName(ctx.profile.full_name) })} description={d.student.welcomeText} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          {inProgress.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold">{d.student.inProgress}</h2>
              <div className="flex flex-col gap-3">{inProgress.map((a) => <StudentAssessmentCard key={a.id} a={a} d={d} locale={locale} />)}</div>
            </section>
          )}
          <section>
            <h2 className="mb-3 text-sm font-semibold">{d.student.toDo}</h2>
            {toDo.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-surface"><EmptyState icon={ClipboardList} title={d.student.noAssessments} /></div>
            ) : (
              <div className="flex flex-col gap-3">{toDo.map((a) => <StudentAssessmentCard key={a.id} a={a} d={d} locale={locale} />)}</div>
            )}
          </section>
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold">{d.student.upcoming}</h2>
              <div className="flex flex-col gap-3">{upcoming.map((a) => <StudentAssessmentCard key={a.id} a={a} d={d} locale={locale} />)}</div>
            </section>
          )}
          {done.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold">{d.student.completed}</h2>
              <div className="flex flex-col gap-3">{done.slice(0, 5).map((a) => <StudentAssessmentCard key={a.id} a={a} d={d} locale={locale} />)}</div>
            </section>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title={d.student.recentResults} action={avg !== null ? <Badge tone="primary">{d.common.average}: {avg}%</Badge> : undefined} />
            <CardBody className="p-0">
              {!grades?.length ? <EmptyState icon={Trophy} title={d.student.noResults} /> : (
                <ul className="divide-y divide-border">
                  {grades.map((g) => (
                    <li key={g.attempt_id}>
                      <Link href={`/student/results/${g.attempt_id}`} className="block px-5 py-3 hover:bg-muted/40">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{g.assessment?.title}</span>
                          <span className="shrink-0 text-sm tabular-nums">{formatPoints(Number(g.score))}/{formatPoints(Number(g.max_score))}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <ProgressBar value={Number(g.percent)} tone={Number(g.percent) >= 65 ? "success" : Number(g.percent) >= 40 ? "warning" : "danger"} />
                          <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{Math.round(Number(g.percent))}%</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{subjectName(g.assessment?.subject, locale)} · {formatDate(g.approved_at, locale)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={d.student.myClasses} />
            <CardBody>
              {!classes?.length ? <p className="text-[13px] text-muted-foreground">{d.student.noClasses}</p> : (
                <div className="flex flex-wrap gap-2">{classes.map((c) => c.class && <Badge key={c.class.id} tone="primary">{c.class.name}</Badge>)}</div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
