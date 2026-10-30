import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { subjectName } from "@/lib/i18n/format";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { SimpleForm } from "@/components/forms/simple-form";
import { ActionButton } from "@/components/forms/action-button";
import { assignTeacherAction, enrollStudentAction, removeTeacherAction, unenrollStudentAction } from "@/lib/actions/admin";
import { fmt } from "@/lib/utils";

export default async function AdminClassDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("school_admin");
  const schoolId = ctx.schoolId!;
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data: cls } = await supabase.from("classes").select("id, name, grade").eq("id", id).eq("school_id", schoolId).maybeSingle();
  if (!cls) notFound();

  const [{ data: teachers }, { data: enrolled }, { data: schoolTeachers }, { data: schoolStudents }, { data: subjects }] = await Promise.all([
    supabase.from("class_teachers").select("id, teacher:profiles(full_name), subject:subjects(name_ru, name_kk)").eq("class_id", id),
    supabase.from("class_enrollments").select("id, student:profiles(id, full_name, login, email)").eq("class_id", id),
    supabase.from("school_memberships").select("profile:profiles(id, full_name)").eq("school_id", schoolId).eq("role", "teacher").eq("status", "active"),
    supabase.from("school_memberships").select("profile:profiles(id, full_name)").eq("school_id", schoolId).eq("role", "student").eq("status", "active"),
    supabase.from("subjects").select("id, name_ru, name_kk").eq("school_id", schoolId).order("name_ru"),
  ]);
  const enrolledIds = new Set((enrolled ?? []).map((e) => e.student?.id));
  const available = (schoolStudents ?? []).map((s) => s.profile).filter((p): p is { id: string; full_name: string } => !!p && !enrolledIds.has(p.id));

  return (
    <>
      <PageHeader title={`${cls.name} · ${fmt(d.common.gradeN, { n: cls.grade })}`} breadcrumb={<Link href="/admin/classes" className="hover:underline">{d.admin.classes}</Link>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={d.common.teachers} />
          <CardBody className="flex flex-col gap-4">
            {!teachers?.length ? <p className="text-[13px] text-muted-foreground">{d.admin.noTeachers}</p> : (
              <ul className="divide-y divide-border">
                {teachers.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>{t.teacher?.full_name} <span className="text-muted-foreground">· {subjectName(t.subject, locale)}</span></span>
                    <ActionButton variant="ghost" action={removeTeacherAction.bind(null, t.id, id)}>{d.common.remove}</ActionButton>
                  </li>
                ))}
              </ul>
            )}
            <SimpleForm
              action={async (v) => { "use server"; return assignTeacherAction(id, v.teacherId ?? "", v.subjectId || null); }}
              submitLabel={d.admin.assignTeacher}
              columns={2}
              fields={[
                { name: "teacherId", label: d.common.teacher, type: "select", required: true, options: (schoolTeachers ?? []).flatMap((t) => (t.profile ? [{ value: t.profile.id, label: t.profile.full_name }] : [])) },
                { name: "subjectId", label: d.common.subject, type: "select", options: (subjects ?? []).map((s) => ({ value: s.id, label: subjectName(s, locale) })) },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={`${d.common.students} (${enrolled?.length ?? 0})`} />
          <CardBody className="flex flex-col gap-4">
            {!enrolled?.length ? <EmptyState title={d.admin.noStudents} /> : (
              <ul className="max-h-[480px] divide-y divide-border overflow-y-auto">
                {enrolled.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>{e.student?.full_name} <span className="text-xs text-muted-foreground">{e.student?.login ?? e.student?.email}</span></span>
                    <ActionButton variant="ghost" action={unenrollStudentAction.bind(null, e.id, id)}>{d.admin.unenroll}</ActionButton>
                  </li>
                ))}
              </ul>
            )}
            {available.length > 0 && (
              <SimpleForm
                action={async (v) => { "use server"; return enrollStudentAction(id, v.studentId ?? ""); }}
                submitLabel={d.admin.enrollStudent}
                fields={[{ name: "studentId", label: d.common.student, type: "select", required: true, options: available.sort((a, b) => a.full_name.localeCompare(b.full_name)).map((p) => ({ value: p.id, label: p.full_name })) }]}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
