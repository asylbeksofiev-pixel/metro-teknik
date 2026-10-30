import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SimpleForm } from "@/components/forms/simple-form";
import { ActionButton } from "@/components/forms/action-button";
import { createClassAction, createSubjectAction, deleteClassAction, deleteSubjectAction } from "@/lib/actions/admin";
import { fmt } from "@/lib/utils";

export default async function AdminClasses() {
  const ctx = await requireRole("school_admin");
  const schoolId = ctx.schoolId!;
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const [{ data: classes }, { data: years }, { data: subjects }] = await Promise.all([
    supabase.from("classes").select("id, name, grade, year:academic_years(name), class_enrollments(count), class_teachers(count)").eq("school_id", schoolId).order("grade").order("name"),
    supabase.from("academic_years").select("id, name, is_current").eq("school_id", schoolId).order("starts_on", { ascending: false }),
    supabase.from("subjects").select("id, name_ru, name_kk, code").eq("school_id", schoolId).order("name_ru"),
  ]);
  const currentYear = years?.find((y) => y.is_current);

  return (
    <>
      <PageHeader title={d.admin.classes} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardBody className="p-0">
            {!classes?.length ? <EmptyState title={d.admin.noClasses} /> : (
              <Table>
                <THead><TR><TH>{d.common.class}</TH><TH>{d.common.grade}</TH><TH>{d.admin.academicYear}</TH><TH>{d.common.students}</TH><TH>{d.common.teachers}</TH><TH /></TR></THead>
                <TBody>
                  {classes.map((c) => (
                    <TR key={c.id}>
                      <TD className="font-medium"><Link className="text-primary hover:underline" href={`/admin/classes/${c.id}`}>{c.name}</Link></TD>
                      <TD>{fmt(d.common.gradeN, { n: c.grade })}</TD>
                      <TD className="text-muted-foreground">{c.year?.name ?? "—"}</TD>
                      <TD>{c.class_enrollments[0]?.count ?? 0}</TD>
                      <TD>{c.class_teachers[0]?.count ?? 0}</TD>
                      <TD className="text-right">
                        <ActionButton variant="ghost" action={deleteClassAction.bind(null, c.id)} confirm={{ title: `${d.common.delete}: ${c.name}?`, confirmLabel: d.common.delete }}>{d.common.delete}</ActionButton>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title={d.admin.createClass} />
            <CardBody>
              <SimpleForm
                action={createClassAction}
                submitLabel={d.common.create}
                columns={2}
                fields={[
                  { name: "name", label: d.admin.className, required: true, maxLength: 40 },
                  { name: "grade", label: d.common.grade, type: "select", required: true, options: Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: fmt(d.common.gradeN, { n: i + 1 }) })) },
                  { name: "academicYearId", label: d.admin.academicYear, type: "select", options: (years ?? []).map((y) => ({ value: y.id, label: y.name })), defaultValue: currentYear?.id },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={d.admin.subjects} />
            <CardBody className="flex flex-col gap-4">
              {!subjects?.length ? <p className="text-[13px] text-muted-foreground">{d.admin.noSubjects}</p> : (
                <ul className="flex flex-col divide-y divide-border">
                  {subjects.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                      <span>{locale === "kk" ? s.name_kk : s.name_ru}{s.code && <span className="ml-1 text-muted-foreground">({s.code})</span>}</span>
                      <ActionButton variant="ghost" action={deleteSubjectAction.bind(null, s.id)} confirm={{ title: `${d.common.delete}?`, confirmLabel: d.common.delete }}>{d.common.delete}</ActionButton>
                    </li>
                  ))}
                </ul>
              )}
              <SimpleForm
                action={createSubjectAction}
                submitLabel={d.admin.createSubject}
                fields={[
                  { name: "nameRu", label: d.admin.nameRu, required: true, maxLength: 120 },
                  { name: "nameKk", label: d.admin.nameKk, required: true, maxLength: 120 },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
