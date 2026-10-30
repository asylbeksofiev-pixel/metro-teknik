import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InviteForm } from "@/components/admin/invite-form";
import { CreateStudentForm } from "@/components/admin/create-student-form";
import { ResetPasswordButton } from "@/components/admin/reset-password-button";
import { ActionButton } from "@/components/forms/action-button";
import { SimpleForm } from "@/components/forms/simple-form";
import { setAccommodationAction, setMembershipStatusAction } from "@/lib/actions/admin";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/forms/search-input";

export default async function AdminStudents({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const ctx = await requireRole("school_admin");
  const schoolId = ctx.schoolId!;
  const { d } = await getI18n();
  const supabase = await createClient();
  const [{ data: members }, { data: classes }, { data: enrollments }, { data: accommodations }] = await Promise.all([
    supabase.from("school_memberships").select("id, status, student_code, profile:profiles(id, full_name, email, login)").eq("school_id", schoolId).eq("role", "student"),
    supabase.from("classes").select("id, name, grade").eq("school_id", schoolId).order("grade").order("name"),
    supabase.from("class_enrollments").select("student_id, class:classes!inner(name, school_id)").eq("class.school_id", schoolId),
    supabase.from("student_accommodations").select("student_id, extra_minutes, extra_attempts").eq("school_id", schoolId).is("assessment_id", null),
  ]);
  const classOf = new Map<string, string[]>();
  for (const e of enrollments ?? []) classOf.set(e.student_id, [...(classOf.get(e.student_id) ?? []), e.class.name]);
  const accOf = new Map((accommodations ?? []).map((a) => [a.student_id, a]));
  const needle = q?.trim().toLowerCase();
  const rows = (members ?? [])
    .filter((m) => !needle || [m.profile?.full_name, m.profile?.email, m.profile?.login, m.student_code].some((v) => v?.toLowerCase().includes(needle)))
    .sort((a, b) => (a.profile?.full_name ?? "").localeCompare(b.profile?.full_name ?? ""));
  const classOptions = (classes ?? []).map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <PageHeader title={d.admin.students} />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title={`${d.admin.students} (${rows.length})`} action={<SearchInput placeholder={d.common.search} />} />
          <CardBody className="p-0">
            {!rows.length ? <EmptyState title={d.admin.noStudents} /> : (
              <Table>
                <THead><TR><TH>{d.common.fullName}</TH><TH>{d.admin.login} / {d.common.email}</TH><TH>{d.common.class}</TH><TH>{d.admin.accommodations}</TH><TH>{d.common.status}</TH><TH /></TR></THead>
                <TBody>
                  {rows.map((m) => {
                    const acc = accOf.get(m.profile?.id ?? "");
                    return (
                      <TR key={m.id}>
                        <TD className="font-medium">{m.profile?.full_name}{m.student_code && <span className="ml-1 text-xs text-muted-foreground">#{m.student_code}</span>}</TD>
                        <TD className="text-muted-foreground">{m.profile?.login ?? m.profile?.email}</TD>
                        <TD>{classOf.get(m.profile?.id ?? "")?.join(", ") ?? "—"}</TD>
                        <TD className="text-xs text-muted-foreground">{acc ? `+${acc.extra_minutes} ${d.common.minutes}, +${acc.extra_attempts}` : "—"}</TD>
                        <TD><Badge tone={m.status === "active" ? "success" : "warning"}>{m.status === "active" ? d.admin.active : d.admin.suspended}</Badge></TD>
                        <TD>
                          <div className="flex justify-end gap-1">
                            {m.profile?.login && <ResetPasswordButton studentId={m.profile.id} />}
                            <Dialog>
                              <DialogTrigger asChild><Button variant="ghost" size="sm">{d.admin.accommodations}</Button></DialogTrigger>
                              <DialogContent title={`${d.admin.accommodations}: ${m.profile?.full_name}`}>
                                <SimpleForm
                                  action={async (v) => { "use server"; return setAccommodationAction({ ...v, studentId: m.profile?.id }); }}
                                  submitLabel={d.common.save}
                                  successMessage={d.common.saved}
                                  resetOnSuccess={false}
                                  columns={2}
                                  fields={[
                                    { name: "extraMinutes", label: d.admin.extraMinutes, type: "number", min: 0, max: 600, defaultValue: String(acc?.extra_minutes ?? 0) },
                                    { name: "extraAttempts", label: d.admin.extraAttempts, type: "number", min: 0, max: 5, defaultValue: String(acc?.extra_attempts ?? 0) },
                                  ]}
                                />
                              </DialogContent>
                            </Dialog>
                            <ActionButton variant="ghost" action={setMembershipStatusAction.bind(null, m.id, m.status === "active" ? "suspended" : "active")}>
                              {m.status === "active" ? d.admin.suspend : d.admin.activate}
                            </ActionButton>
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardBody>
            <Tabs defaultValue="login">
              <TabsList className="mb-4 w-full">
                <TabsTrigger value="login" className="flex-1">{d.admin.createStudent}</TabsTrigger>
                <TabsTrigger value="invite" className="flex-1">{d.admin.inviteStudent}</TabsTrigger>
              </TabsList>
              <TabsContent value="login"><CreateStudentForm classes={classOptions} /></TabsContent>
              <TabsContent value="invite"><InviteForm role="student" classes={classOptions} /></TabsContent>
            </Tabs>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
