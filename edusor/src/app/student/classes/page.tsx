import { GraduationCap } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { subjectName } from "@/lib/i18n/format";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { fmt } from "@/lib/utils";

export default async function StudentClasses() {
  const ctx = await requireRole("student");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_enrollments")
    .select("class:classes(id, name, grade, class_teachers(teacher:profiles(full_name), subject:subjects(name_ru, name_kk)))")
    .eq("student_id", ctx.userId);
  const classes = (data ?? []).flatMap((r) => (r.class ? [r.class] : []));
  return (
    <>
      <PageHeader title={d.student.classesTitle} />
      {classes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface"><EmptyState icon={GraduationCap} title={d.student.noClasses} /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {classes.map((c) => (
            <Card key={c.id}>
              <CardHeader title={c.name} description={fmt(d.common.gradeN, { n: c.grade })} />
              <CardBody className="p-0">
                <ul className="divide-y divide-border">
                  {c.class_teachers.map((t, i) => (
                    <li key={i} className="flex justify-between gap-2 px-5 py-2.5 text-sm">
                      <span className="font-medium">{subjectName(t.subject, locale)}</span>
                      <span className="text-muted-foreground">{t.teacher?.full_name}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
