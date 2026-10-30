import Link from "next/link";
import { Radio } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/i18n/format";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function LiveIndex() {
  await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data } = await supabase
    .from("assessments")
    .select("id, title, kind, due_at, class:classes(name), attempts(status)")
    .eq("status", "published")
    .order("due_at", { ascending: true, nullsFirst: false });
  return (
    <>
      <PageHeader title={d.nav.liveMonitoring} />
      <Card>
        <CardBody className="p-0">
          {!data?.length ? <EmptyState icon={Radio} title={d.assessment.noAssessments} /> : (
            <ul className="divide-y divide-border">
              {data.map((a) => {
                const active = a.attempts.filter((t) => t.status === "in_progress").length;
                return (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{d.assessment.kind[a.kind]} · {a.class?.name ?? "—"} · {formatDateTime(a.due_at, locale)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {active > 0 && <Badge tone="warning">{d.live.inProgress}: {active}</Badge>}
                      <Button asChild size="sm"><Link href={`/teacher/assessments/${a.id}/live`}><Radio /> {d.assessment.live}</Link></Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
