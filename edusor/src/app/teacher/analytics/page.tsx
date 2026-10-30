import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { teacherClasses } from "@/lib/data/teacher";
import { formatDateTime } from "@/lib/i18n/format";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function AnalyticsIndex() {
  const ctx = await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const [{ data: assessments }, classes] = await Promise.all([
    supabase.from("assessments").select("id, title, kind, due_at, class:classes(name), final_grades(percent)").in("status", ["published", "closed", "archived"]).order("due_at", { ascending: false, nullsFirst: false }),
    teacherClasses(supabase, ctx.userId),
  ]);
  return (
    <>
      <PageHeader title={d.nav.analytics} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title={d.assessment.listTitle} />
          <CardBody className="p-0">
            {!assessments?.length ? <EmptyState icon={BarChart3} title={d.analytics.noData} /> : (
              <ul className="divide-y divide-border">
                {assessments.map((a) => {
                  const p = a.final_grades.map((g) => Number(g.percent));
                  const avg = p.length ? Math.round(p.reduce((s, x) => s + x, 0) / p.length) : null;
                  return (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{d.assessment.kind[a.kind]} · {a.class?.name ?? "—"} · {formatDateTime(a.due_at, locale)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm tabular-nums text-muted-foreground">{avg === null ? "—" : `${d.common.average}: ${avg}%`}</span>
                        <Button asChild size="sm" variant="secondary"><Link href={`/teacher/assessments/${a.id}/analytics`}><BarChart3 /> {d.assessment.analytics}</Link></Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader title={d.teacher.classProgress} />
          <CardBody className="flex flex-col gap-2">
            {classes.map((c) => <Button key={c.id} asChild variant="ghost" className="justify-start"><Link href={`/teacher/classes/${c.id}/progress`}>{c.name}</Link></Button>)}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
