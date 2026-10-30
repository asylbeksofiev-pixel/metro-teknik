import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SimpleForm } from "@/components/forms/simple-form";
import { ActionButton } from "@/components/forms/action-button";
import { CopyField } from "@/components/admin/invite-form";
import { createAcademicYearAction, setCurrentYearAction, updateSchoolAction } from "@/lib/actions/admin";
import { ProfileSettings } from "@/components/profile-settings";
import { formatDate } from "@/lib/i18n/format";

export default async function AdminSettings() {
  const ctx = await requireRole("school_admin");
  const schoolId = ctx.schoolId!;
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const [{ data: school }, { data: years }] = await Promise.all([
    supabase.from("schools").select("name, city, region, join_code").eq("id", schoolId).single(),
    supabase.from("academic_years").select("id, name, starts_on, ends_on, is_current").eq("school_id", schoolId).order("starts_on", { ascending: false }),
  ]);
  return (
    <>
      <PageHeader title={d.admin.settingsTitle} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={d.admin.schoolName} />
          <CardBody className="flex flex-col gap-5">
            <SimpleForm
              action={updateSchoolAction}
              submitLabel={d.common.save}
              successMessage={d.common.saved}
              resetOnSuccess={false}
              fields={[
                { name: "name", label: d.admin.schoolName, required: true, defaultValue: school?.name, maxLength: 200 },
                { name: "city", label: d.admin.city, defaultValue: school?.city ?? "", maxLength: 100 },
                { name: "region", label: d.admin.region, defaultValue: school?.region ?? "", maxLength: 100 },
              ]}
            />
            {school?.join_code && (
              <div>
                <p className="mb-1.5 text-[13px] font-medium">{d.admin.schoolCode}</p>
                <CopyField value={school.join_code} />
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={d.admin.academicYears} />
          <CardBody className="flex flex-col gap-4">
            <ul className="divide-y divide-border">
              {(years ?? []).map((y) => (
                <li key={y.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>{y.name} <span className="text-xs text-muted-foreground">{formatDate(y.starts_on, locale)} – {formatDate(y.ends_on, locale)}</span></span>
                  {y.is_current ? <Badge tone="success">{d.admin.current}</Badge> : <ActionButton variant="ghost" action={setCurrentYearAction.bind(null, y.id)}>{d.admin.makeCurrent}</ActionButton>}
                </li>
              ))}
            </ul>
            <SimpleForm
              action={createAcademicYearAction}
              submitLabel={d.admin.createYear}
              columns={3}
              fields={[
                { name: "name", label: d.admin.yearName, required: true, maxLength: 40 },
                { name: "startsOn", label: d.admin.startsOn, type: "date", required: true },
                { name: "endsOn", label: d.admin.endsOn, type: "date", required: true },
              ]}
            />
          </CardBody>
        </Card>
        <ProfileSettings ctx={ctx} />
      </div>
    </>
  );
}
