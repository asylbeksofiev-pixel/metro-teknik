import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SimpleForm } from "@/components/forms/simple-form";
import { ActionButton } from "@/components/forms/action-button";
import { InviteAdminForm } from "@/components/super/super-forms";
import { createSchoolAction, setSchoolActiveAction } from "@/lib/actions/super-admin";

export default async function SuperSchools() {
  await requireRole("super_admin");
  const { d } = await getI18n();
  const supabase = await createClient();
  const { data: schools } = await supabase.from("schools").select("id, name, city, join_code, is_active, school_memberships(role)").order("name");
  return (
    <>
      <PageHeader title={d.superAdmin.schools} />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          {!schools?.length ? <Card><EmptyState title={d.common.noData} /></Card> : schools.map((s) => {
            const count = (r: string) => s.school_memberships.filter((m) => m.role === r).length;
            return (
              <Card key={s.id}>
                <CardHeader
                  title={<span className="flex items-center gap-2">{s.name} <Badge tone={s.is_active ? "success" : "warning"}>{s.is_active ? d.admin.active : d.admin.suspended}</Badge></span>}
                  description={`${s.city ?? "—"} · ${d.admin.schoolCode}: ${s.join_code} · ${d.common.teachers}: ${count("teacher")} · ${d.common.students}: ${count("student")} · ${d.roles.school_admin}: ${count("school_admin")}`}
                  action={<ActionButton variant="ghost" action={setSchoolActiveAction.bind(null, s.id, !s.is_active)} confirm={{ title: s.is_active ? d.superAdmin.deactivate : d.superAdmin.activate }}>{s.is_active ? d.superAdmin.deactivate : d.superAdmin.activate}</ActionButton>}
                />
                <CardBody><InviteAdminForm schoolId={s.id} /></CardBody>
              </Card>
            );
          })}
        </div>
        <Card className="self-start">
          <CardHeader title={d.superAdmin.createSchool} />
          <CardBody>
            <SimpleForm action={createSchoolAction} submitLabel={d.common.create} fields={[
              { name: "name", label: d.admin.schoolName, required: true, maxLength: 200 },
              { name: "city", label: d.admin.city, maxLength: 100 },
              { name: "region", label: d.admin.region, maxLength: 100 },
            ]} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
