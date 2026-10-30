import Link from "next/link";
import { Users } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { teacherClasses } from "@/lib/data/teacher";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SearchInput } from "@/components/forms/search-input";
import { UrlSelect } from "@/components/forms/url-select";
import { Badge } from "@/components/ui/badge";

type Sort = "name" | "avg" | "last";

export default async function TeacherStudents({ searchParams }: { searchParams: Promise<{ q?: string; class?: string; sort?: Sort; status?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireRole("teacher");
  const { d } = await getI18n();
  const supabase = await createClient();
  const classes = await teacherClasses(supabase, ctx.userId);
  const classIds = sp.class && classes.some((c) => c.id === sp.class) ? [sp.class] : classes.map((c) => c.id);

  const [{ data: enrollments }, { data: grades }, { data: attempts }] = classIds.length
    ? await Promise.all([
        supabase.from("class_enrollments").select("class_id, student:profiles(id, full_name, login, email)").in("class_id", classIds),
        supabase.from("final_grades").select("student_id, percent, approved_at"),
        supabase.from("attempts").select("student_id, status, grading_status, created_at").order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const className = new Map(classes.map((c) => [c.id, c.name]));
  const students = new Map<string, { id: string; name: string; login: string | null; classes: string[]; avg: number | null; last: number | null; n: number; status: string | null }>();
  for (const e of enrollments ?? []) {
    if (!e.student) continue;
    const s = students.get(e.student.id) ?? { id: e.student.id, name: e.student.full_name, login: e.student.login ?? e.student.email, classes: [], avg: null, last: null, n: 0, status: null };
    s.classes.push(className.get(e.class_id) ?? "");
    students.set(e.student.id, s);
  }
  const agg = new Map<string, { sum: number; n: number; last: number; at: string }>();
  for (const g of grades ?? []) {
    const a = agg.get(g.student_id) ?? { sum: 0, n: 0, last: 0, at: "" };
    a.sum += Number(g.percent); a.n++;
    if (g.approved_at > a.at) { a.at = g.approved_at; a.last = Number(g.percent); }
    agg.set(g.student_id, a);
  }
  const latestAttempt = new Map<string, string>();
  for (const t of attempts ?? []) if (!latestAttempt.has(t.student_id)) latestAttempt.set(t.student_id, t.status === "in_progress" ? "in_progress" : t.grading_status === "graded" ? "graded" : t.grading_status === "needs_review" ? "needs_review" : "submitted");
  for (const s of students.values()) {
    const a = agg.get(s.id);
    if (a) { s.avg = Math.round((a.sum / a.n) * 10) / 10; s.last = a.last; s.n = a.n; }
    s.status = latestAttempt.get(s.id) ?? null;
  }

  const q = sp.q?.trim().toLowerCase();
  let rows = [...students.values()].filter((s) => !q || s.name.toLowerCase().includes(q) || s.login?.toLowerCase().includes(q));
  if (sp.status) rows = rows.filter((s) => s.status === sp.status);
  const sort: Sort = sp.sort ?? "name";
  rows.sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "avg" ? (a.avg ?? -1) - (b.avg ?? -1) : (a.last ?? -1) - (b.last ?? -1));

  return (
    <>
      <PageHeader title={d.teacher.studentsTitle} />
      <Card>
        <CardHeader
          title={`${d.teacher.studentsTitle} (${rows.length})`}
          action={
            <div className="flex flex-wrap gap-2">
              <SearchInput placeholder={d.common.search} />
              <UrlSelect param="class" label={d.common.class} options={classes.map((c) => ({ value: c.id, label: c.name }))} allLabel={d.common.all} />
              <UrlSelect param="status" label={d.common.status} allLabel={d.common.all} options={(["in_progress", "submitted", "needs_review", "graded"] as const).map((s) => ({ value: s, label: d.status[s] }))} />
              <UrlSelect param="sort" label={d.common.sortBy} options={[{ value: "name", label: d.common.name }, { value: "avg", label: d.teacher.averageResult }, { value: "last", label: d.teacher.lastResult }]} />
            </div>
          }
        />
        <CardBody className="p-0">
          {!rows.length ? <EmptyState icon={Users} title={d.teacher.noStudents} /> : (
            <Table>
              <THead><TR><TH>{d.common.fullName}</TH><TH>{d.admin.login}</TH><TH>{d.common.class}</TH><TH>{d.common.status}</TH><TH>{d.teacher.lastResult}</TH><TH>{d.teacher.averageResult}</TH><TH>{d.teacher.assessmentsTaken}</TH></TR></THead>
              <TBody>
                {rows.map((s) => (
                  <TR key={s.id}>
                    <TD><Link href={`/teacher/students/${s.id}`} className="font-medium hover:text-primary hover:underline">{s.name}</Link></TD>
                    <TD className="text-muted-foreground">{s.login}</TD>
                    <TD>{s.classes.join(", ")}</TD>
                    <TD>{s.status ? <Badge tone={s.status === "graded" ? "success" : s.status === "needs_review" ? "warning" : "info"}>{d.status[s.status as "graded"]}</Badge> : "—"}</TD>
                    <TD className="tabular-nums">{s.last !== null ? `${s.last}%` : "—"}</TD>
                    <TD className="tabular-nums">{s.avg !== null ? `${s.avg}%` : "—"}</TD>
                    <TD className="tabular-nums">{s.n}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}
