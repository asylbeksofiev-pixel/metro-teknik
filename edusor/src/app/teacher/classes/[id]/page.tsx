import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, LineChart } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, subjectName } from "@/lib/i18n/format";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/utils";

export default async function TeacherClassDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data: cls } = await supabase.from("classes").select("id, name, grade, class_teachers(subject:subjects(id, name_ru, name_kk), teacher:profiles(full_name))").eq("id", id).maybeSingle();
  if (!cls) notFound();

  const [{ data: students }, { data: assessments }, { data: grades }] = await Promise.all([
    supabase.from("class_enrollments").select("student:profiles(id, full_name, login, email)").eq("class_id", id),
    supabase.from("assessments").select("id, title, kind, status, due_at, subject:subjects(name_ru, name_kk)").eq("class_id", id).order("created_at", { ascending: false }),
    supabase.from("final_grades").select("student_id, percent, approved_at, assessment:assessments!inner(class_id)").eq("assessment.class_id", id),
  ]);
  const stats = new Map<string, { sum: number; n: number; last: number; lastAt: string }>();
  for (const g of grades ?? []) {
    const s = stats.get(g.student_id) ?? { sum: 0, n: 0, last: 0, lastAt: "" };
    s.sum += Number(g.percent);
    s.n += 1;
    if (g.approved_at > s.lastAt) { s.last = Number(g.percent); s.lastAt = g.approved_at; }
    stats.set(g.student_id, s);
  }
  const rows = (students ?? []).flatMap((s) => (s.student ? [s.student] : [])).sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <>
      <PageHeader
        title={`${cls.name} · ${fmt(d.common.gradeN, { n: cls.grade })}`}
        breadcrumb={<Link href="/teacher/classes" className="hover:underline">{d.teacher.classesTitle}</Link>}
        description={cls.class_teachers.map((ct) => subjectName(ct.subject, locale)).filter((s) => s !== "—").join(", ")}
        actions={
          <>
            <Button asChild variant="secondary"><Link href={`/teacher/classes/${id}/progress`}><LineChart /> {d.teacher.classProgress}</Link></Button>
            <Button asChild><Link href={`/teacher/assessments/new?classId=${id}`}><Plus /> {d.teacher.newAssessmentForClass}</Link></Button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader title={`${d.teacher.classStudents} (${rows.length})`} />
          <CardBody className="p-0">
            {!rows.length ? <EmptyState title={d.teacher.noStudents} /> : (
              <Table>
                <THead><TR><TH>{d.common.fullName}</TH><TH>{d.teacher.lastResult}</TH><TH>{d.teacher.averageResult}</TH><TH>{d.teacher.assessmentsTaken}</TH></TR></THead>
                <TBody>
                  {rows.map((s) => {
                    const st = stats.get(s.id);
                    return (
                      <TR key={s.id}>
                        <TD><Link href={`/teacher/students/${s.id}`} className="font-medium hover:text-primary hover:underline">{s.full_name}</Link></TD>
                        <TD className="tabular-nums">{st ? `${st.last}%` : "—"}</TD>
                        <TD className="tabular-nums">{st ? `${Math.round((st.sum / st.n) * 10) / 10}%` : "—"}</TD>
                        <TD className="tabular-nums">{st?.n ?? 0}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader title={d.teacher.classAssessments} />
          <CardBody className="p-0">
            {!assessments?.length ? <EmptyState title={d.assessment.noAssessments} /> : (
              <ul className="divide-y divide-border">
                {assessments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <Link href={`/teacher/assessments/${a.id}`} className="block truncate text-sm font-medium hover:underline">{a.title}</Link>
                      <p className="text-xs text-muted-foreground">{d.assessment.kind[a.kind]} · {subjectName(a.subject, locale)} · {formatDateTime(a.due_at, locale)}</p>
                    </div>
                    <Badge tone={a.status === "published" ? "success" : a.status === "draft" ? "neutral" : "info"}>{d.status[a.status]}</Badge>
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
