import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui/misc";
import { ProfileSettings } from "@/components/profile-settings";

export default async function StudentProfile() {
  const ctx = await requireRole("student");
  const { d } = await getI18n();
  return (
    <>
      <PageHeader title={d.student.profileTitle} />
      <div className="grid gap-6 lg:grid-cols-2"><ProfileSettings ctx={ctx} /></div>
    </>
  );
}
