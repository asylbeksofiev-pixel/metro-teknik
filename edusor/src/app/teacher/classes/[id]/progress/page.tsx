import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { loadPerformance } from "@/lib/data/progress";
import { mean, round1, topicPerformance } from "@/lib/analytics/stats";
import { subjectName } from "@/lib/i18n/format";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PercentBars, TrendChart } from "@/components/charts/charts";

export default async function ClassProgress({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data: cls } = await supabase.from("classes").select("id, name").eq("id", id).maybeSingle();
  if (!cls) notFound();
  const [{ data: enrolled }, { data: assessments }] = await Promise.all([
    supabase.from("class_enrollments").select("student:profiles(id, full_name)").eq("class_id", id),
    supabase.from("assessments").select("id, title, due_at, published_at, subject:subjects(id, name_ru, name_kk), attempts(student_id, status)").eq("class_id", id).in("status", ["published", "closed", "archived"]).order("published_at"),
  ]);
  const students = (enrolled ?? []).flatMap((e) => (e.student ? [e.student] : []));
  const studentIds = new Set(students.map((s) => s.id));
  const { grades, details } = await loadPerformance(supabase, { assessmentIds: (assessments ?? []).map((a) => a.id) });
  const classGrades = grades.filter((g) => studentIds.has(g.studentId));
  const classDetails = details.filter((x) => studentIds.has(x.studentId));

  const perAssessment = (assessments ?? []).map((a) => {
    const g = classGrades.filter((x) => x.assessmentId === a.id).map((x) => x.percent);
    const submitted = new Set(a.attempts.filter((t) => t.status === "submitted" && studentIds.has(t.student_id)).map((t) => t.student_id));
    return { id: a.id, title: a.title, avg: round1(mean(g)), completion: students.length ? Math.round((submitted.size / students.length) * 100) : 0, subject: a.subject };
  });
  const subjects = new Map<string, { name: string; values: number[] }>();
  for (const a of assessments ?? []) {
    if (!a.subject) continue;
    const e = subjects.get(a.subject.id) ?? { name: subjectName(a.subject, locale), values: [] };
    e.values.push(...classGrades.filter((x) => x.assessmentId === a.id).map((x) => x.percent));
    subjects.set(a.subject.id, e);
  }
  const topics = topicPerformance(classDetails);
  const support = students.flatMap((s) => {
    const mine = classGrades.filter((g) => g.studentId === s.id).slice(-3);
    const avg = mean(mine.map((g) => g.percent));
    return mine.length >= 2 && avg !== null && avg < 50 ? [{ ...s, avg: round1(avg)! }] : [];
  });

  return (
    <>
      <PageHeader title={`${d.teacher.classProgress}: ${cls.name}`} breadcrumb={<Link href={`/teacher/classes/${id}`} className="hover:underline">{cls.name}</Link>} />
      {!classGrades.length ? <div className="rounded-lg border border-dashed border-border bg-surface"><EmptyState title={d.analytics.noData} /></div> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader title={d.analytics.scoreTrend} />
            <CardBody><TrendChart data={perAssessment.filter((p) => p.avg !== null).map((p) => ({ label: p.title.slice(0, 18), value: p.avg! }))} valueLabel={d.analytics.averageScore} /></CardBody>
          </Card>
          <Card>
            <CardHeader title={d.analytics.completionRate} />
            <CardBody><PercentBars rows={perAssessment.map((p) => ({ label: p.title, percent: p.completion }))} empty={d.common.noData} /></CardBody>
          </Card>
          <Card>
            <CardHeader title={d.analytics.subjectPerformance} />
            <CardBody><PercentBars rows={[...subjects.values()].filter((s) => s.values.length).map((s) => ({ label: s.name, percent: round1(mean(s.values))! }))} empty={d.common.noData} /></CardBody>
          </Card>
          <Card>
            <CardHeader title={d.analytics.topicPerformance} />
            <CardBody><PercentBars rows={topics.map((t) => ({ label: t.topic, percent: t.percent, note: `(${t.responses})` }))} empty={d.common.noData} /></CardBody>
          </Card>
          <Card>
            <CardHeader title={d.analytics.missedTopics} />
            <CardBody><PercentBars rows={topics.filter((t) => t.percent < 50 && t.responses >= 5).map((t) => ({ label: t.topic, percent: t.percent }))} empty={d.common.noData} /></CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title={d.analytics.needsSupport} description={d.analytics.needsSupportHint} />
            <CardBody>
              {!support.length ? <p className="text-sm text-muted-foreground">{d.common.noData}</p> : (
                <ul className="flex flex-wrap gap-2">{support.map((s) => <li key={s.id}><Link href={`/teacher/students/${s.id}`}><Badge tone="warning">{s.full_name} · {s.avg}%</Badge></Link></li>)}</ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
