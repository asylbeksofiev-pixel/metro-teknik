import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { teacherClasses } from "@/lib/data/teacher";
import { subjectName } from "@/lib/i18n/format";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function TeacherSubjects() {
  const ctx = await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const classes = await teacherClasses(supabase, ctx.userId);
  const bySubject = new Map<string, { name: string; classes: string[] }>();
  for (const c of classes) for (const s of c.subjects) {
    const e = bySubject.get(s.id) ?? { name: subjectName(s, locale), classes: [] };
    e.classes.push(c.name);
    bySubject.set(s.id, e);
  }
  return (
    <>
      <PageHeader title={d.teacher.subjectsTitle} description={d.teacher.subjectsHint} />
      <Card>
        <CardBody className="p-0">
          {bySubject.size === 0 ? <EmptyState title={d.admin.noSubjects} /> : (
            <ul className="divide-y divide-border">
              {[...bySubject.entries()].map(([id, s]) => (
                <li key={id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <span className="font-medium">{s.name}</span>
                  <span className="flex flex-wrap gap-1.5">{s.classes.map((c) => <Badge key={c}>{c}</Badge>)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
