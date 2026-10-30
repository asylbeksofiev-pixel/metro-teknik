import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/i18n/format";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/forms/search-input";

export default async function SuperUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  await requireRole("super_admin");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  let query = supabase.from("profiles").select("id, full_name, email, login, is_super_admin, created_at, school_memberships(role, status, school:schools(name))").order("created_at", { ascending: false }).limit(200);
  const needle = q?.trim().replace(/[%_,()]/g, "");
  if (needle) query = query.or(`full_name.ilike.%${needle}%,email.ilike.%${needle}%,login.ilike.%${needle}%`);
  const { data: users } = await query;
  return (
    <>
      <PageHeader title={d.superAdmin.users} />
      <Card>
        <CardHeader title={`${d.superAdmin.users} (${users?.length ?? 0})`} action={<SearchInput placeholder={d.common.search} />} />
        <CardBody className="p-0">
          {!users?.length ? <EmptyState title={d.common.noData} /> : (
            <Table>
              <THead><TR><TH>{d.common.fullName}</TH><TH>{d.common.email}</TH><TH>{d.superAdmin.memberships}</TH><TH>{d.common.date}</TH></TR></THead>
              <TBody>
                {users.map((u) => (
                  <TR key={u.id}>
                    <TD className="font-medium">{u.full_name || "—"} {u.is_super_admin && <Badge tone="danger">{d.superAdmin.superFlag}</Badge>}</TD>
                    <TD className="text-muted-foreground">{u.login ?? u.email}</TD>
                    <TD><div className="flex flex-wrap gap-1">{u.school_memberships.map((m, i) => <Badge key={i} tone={m.status === "active" ? "primary" : "warning"}>{d.roles[m.role]} · {m.school?.name}</Badge>)}</div></TD>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDate(u.created_at, locale)}</TD>
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
