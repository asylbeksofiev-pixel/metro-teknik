import type { SessionContext } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { SimpleForm } from "@/components/forms/simple-form";
import { changePasswordAction, updateProfileAction } from "@/lib/actions/profile";

export async function ProfileSettings({ ctx }: { ctx: SessionContext }) {
  const { d } = await getI18n();
  return (
    <>
      <Card>
        <CardHeader title={d.settings.title} description={ctx.profile.login ?? ctx.email ?? undefined} />
        <CardBody>
          <SimpleForm
            action={updateProfileAction}
            submitLabel={d.common.save}
            successMessage={d.settings.profileSaved}
            resetOnSuccess={false}
            fields={[
              { name: "fullName", label: d.settings.fullName, required: true, defaultValue: ctx.profile.full_name, maxLength: 200 },
              { name: "locale", label: d.settings.language, type: "select", required: true, defaultValue: ctx.profile.locale, options: [{ value: "ru", label: "Русский" }, { value: "kk", label: "Қазақша" }] },
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={d.settings.password} />
        <CardBody>
          <SimpleForm
            action={changePasswordAction}
            submitLabel={d.common.save}
            successMessage={d.settings.passwordChanged}
            fields={[
              { name: "password", label: d.auth.newPassword, type: "password", required: true },
              { name: "passwordRepeat", label: d.auth.passwordRepeat, type: "password", required: true },
            ]}
          />
        </CardBody>
      </Card>
    </>
  );
}
