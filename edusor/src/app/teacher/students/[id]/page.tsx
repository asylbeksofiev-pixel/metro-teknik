import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { loadPerformance } from "@/lib/data/progress";
import { PageHeader } from "@/components/ui/misc";
import { StudentInsights } from "@/components/progress/student-insights";

export default async function TeacherStudentProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data: student } = await supabase.from("profiles").select("id, full_name, login, email").eq("id", id).maybeSingle();
  if (!student) notFound();
  const [{ grades, details }, { data: enrolled }, { data: attempts }] = await Promise.all([
    loadPerformance(supabase, { studentIds: [id] }),
    supabase.from("class_enrollments").select("class_id, class:classes(name)").eq("student_id", id),
    supabase.from("attempts").select("assessment_id").eq("student_id", id).eq("status", "submitted"),
  ]);
  const classIds = (enrolled ?? []).map((e) => e.class_id);
  const { data: assigned } = classIds.length
    ? await supabase.from("assessments").select("id, title, due_at, assessment_assignments!inner(class_id)").in("assessment_assignments.class_id", classIds).in("status", ["published", "closed"]).lt("due_at", new Date().toISOString())
    : { data: [] };
  const done = new Set((attempts ?? []).map((t) => t.assessment_id));
  const missing = (assigned ?? []).filter((a) => !done.has(a.id)).map((a) => ({ id: a.id, title: a.title, due: a.due_at }));
  return (
    <>
      <PageHeader
        title={student.full_name}
        breadcrumb={<Link href="/teacher/students" className="hover:underline">{d.teacher.studentsTitle}</Link>}
        description={`${student.login ?? student.email ?? ""} · ${(enrolled ?? []).map((e) => e.class?.name).join(", ")}`}
      />
      <StudentInsights grades={grades} details={details} d={d} locale={locale} resultHref={(attemptId) => `/teacher/submissions/${attemptId}/review`} missing={missing} />
    </>
  );
}
