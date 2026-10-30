import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { InviteForm } from "@/components/admin/invite-form";
import { ActionButton } from "@/components/forms/action-button";
import { revokeInvitationAction, setMembershipStatusAction } from "@/lib/actions/admin";
import { formatDate } from "@/lib/i18n/format";

export default async function AdminTeachers() {
  const ctx = await requireRole("school_admin");
  const schoolId = ctx.schoolId!;
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const [{ data: members }, { data: invites }, { data: links }] = await Promise.all([
    supabase.from("school_memberships").select("id, role, status, created_at, profile:profiles(id, full_name, email)").eq("school_id", schoolId).in("role", ["teacher", "school_admin"]).order("created_at"),
    supabase.from("invitations").select("id, email, role, expires_at").eq("school_id", schoolId).in("role", ["teacher", "school_admin"]).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()),
    supabase.from("class_teachers").select("teacher_id, class:classes!inner(name, school_id)").eq("class.school_id", schoolId),
  ]);
  const classesByTeacher = new Map<string, string[]>();
  for (const l of links ?? []) classesByTeacher.set(l.teacher_id, [...(classesByTeacher.get(l.teacher_id) ?? []), l.class.name]);

  return (
    <>
      <PageHeader title={d.admin.teachers} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardBody className="p-0">
            {!members?.length ? <EmptyState title={d.admin.noTeachers} /> : (
              <Table>
                <THead><TR><TH>{d.common.fullName}</TH><TH>{d.common.email}</TH><TH>{d.common.classes}</TH><TH>{d.common.status}</TH><TH /></TR></THead>
                <TBody>
                  {members.map((m) => (
                    <TR key={m.id}>
                      <TD className="font-medium">{m.profile?.full_name || "—"} {m.role === "school_admin" && <Badge tone="primary">{d.roles.school_admin}</Badge>}</TD>
                      <TD className="text-muted-foreground">{m.profile?.email}</TD>
                      <TD className="text-muted-foreground">{classesByTeacher.get(m.profile?.id ?? "")?.join(", ") || "—"}</TD>
                      <TD><Badge tone={m.status === "active" ? "success" : "warning"}>{m.status === "active" ? d.admin.active : d.admin.suspended}</Badge></TD>
                      <TD className="text-right">
                        {m.profile?.id !== ctx.userId && (
                          <ActionButton variant="ghost" action={setMembershipStatusAction.bind(null, m.id, m.status === "active" ? "suspended" : "active")}>
                            {m.status === "active" ? d.admin.suspend : d.admin.activate}
                          </ActionButton>
                        )}
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
            <CardHeader title={d.admin.inviteTeacher} />
            <CardBody><InviteForm role="teacher" /></CardBody>
          </Card>
          {invites && invites.length > 0 && (
            <Card>
              <CardHeader title={d.admin.pendingInvites} />
              <CardBody className="p-0">
                <ul className="divide-y divide-border">
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-[13px]">
                      <span className="min-w-0 truncate">{i.email}<span className="block text-xs text-muted-foreground">{formatDate(i.expires_at, locale)}</span></span>
                      <ActionButton variant="ghost" action={revokeInvitationAction.bind(null, i.id)}>{d.admin.revoke}</ActionButton>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
