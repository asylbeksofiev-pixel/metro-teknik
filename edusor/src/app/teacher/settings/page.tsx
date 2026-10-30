import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui/misc";
import { ProfileSettings } from "@/components/profile-settings";

export default async function TeacherSettings() {
  const ctx = await requireRole("teacher");
  const { d } = await getI18n();
  return (
    <>
      <PageHeader title={d.teacher.settingsTitle} />
      <div className="grid gap-6 lg:grid-cols-2"><ProfileSettings ctx={ctx} /></div>
    </>
  );
}
