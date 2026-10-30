import Link from "next/link";
import { GraduationCap, Users } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { teacherClasses } from "@/lib/data/teacher";
import { subjectName } from "@/lib/i18n/format";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { fmt } from "@/lib/utils";

export default async function TeacherClasses() {
  const ctx = await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const classes = await teacherClasses(supabase, ctx.userId);
  return (
    <>
      <PageHeader title={d.teacher.classesTitle} />
      {classes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface"><EmptyState icon={GraduationCap} title={d.teacher.noClasses} /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Link key={c.id} href={`/teacher/classes/${c.id}`} className="group rounded-lg border border-border bg-surface p-5 shadow-card transition-colors hover:border-primary/40">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold group-hover:text-primary">{c.name}</h2>
                  <p className="text-[13px] text-muted-foreground">{fmt(d.common.gradeN, { n: c.grade })}</p>
                </div>
                <span className="flex items-center gap-1 text-[13px] text-muted-foreground"><Users className="size-4" /> {c.students}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {c.subjects.map((s) => <Badge key={s.id} tone="primary">{subjectName(s, locale)}</Badge>)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
