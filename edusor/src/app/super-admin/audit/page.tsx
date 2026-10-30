import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/i18n/format";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function SuperAudit() {
  await requireRole("super_admin");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const [{ data: events }, { data: errors }] = await Promise.all([
    supabase.from("audit_events").select("id, action, entity_type, created_at, metadata, actor:profiles(full_name), school:schools(name)").order("created_at", { ascending: false }).limit(200),
    supabase.from("system_errors").select("id, source, message, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  return (
    <>
      <PageHeader title={d.superAdmin.auditTitle} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardBody className="p-0">
            {!events?.length ? <EmptyState title={d.common.noData} /> : (
              <Table>
                <THead><TR><TH>{d.common.date}</TH><TH>{d.superAdmin.action}</TH><TH>{d.superAdmin.actor}</TH><TH>{d.superAdmin.schools}</TH><TH>{d.superAdmin.entity}</TH></TR></THead>
                <TBody>
                  {events.map((e) => (
                    <TR key={e.id}>
                      <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(e.created_at, locale)}</TD>
                      <TD className="font-mono text-xs">{e.action}</TD>
                      <TD>{e.actor?.full_name ?? "—"}</TD>
                      <TD className="text-muted-foreground">{e.school?.name ?? "—"}</TD>
                      <TD className="font-mono text-xs text-muted-foreground">{e.entity_type} {Object.keys((e.metadata as object) ?? {}).length ? JSON.stringify(e.metadata).slice(0, 80) : ""}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={d.superAdmin.systemErrors} />
          <CardBody className="p-0">
            {!errors?.length ? <EmptyState title={d.superAdmin.noErrors} /> : (
              <ul className="divide-y divide-border">
                {errors.map((e) => <li key={e.id} className="px-5 py-2.5 text-[13px]"><span className="font-mono text-xs text-muted-foreground">{formatDateTime(e.created_at, locale)} · {e.source}</span><p className="break-words">{e.message}</p></li>)}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
