import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { aiConfigured, aiModels } from "@/lib/ai/client";
import { PageHeader, Alert } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { TestAiButton } from "@/components/super/super-forms";
import { ProfileSettings } from "@/components/profile-settings";

export default async function SuperSettings() {
  const ctx = await requireRole("super_admin");
  const { d } = await getI18n();
  const m = aiModels();
  return (
    <>
      <PageHeader title={d.nav.settings} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={d.superAdmin.aiSettings} />
          <CardBody className="flex flex-col gap-4">
            <Alert tone={aiConfigured() ? "success" : "warning"}>{aiConfigured() ? d.superAdmin.aiConfigured : d.superAdmin.aiNotConfigured}</Alert>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{d.superAdmin.aiBaseUrl}</dt><dd className="break-all font-mono text-xs">{m.baseUrl}</dd>
              <dt className="text-muted-foreground">{d.superAdmin.aiModelText}</dt><dd className="font-mono text-xs">{m.text}</dd>
              <dt className="text-muted-foreground">{d.superAdmin.aiModelVision}</dt><dd className="font-mono text-xs">{m.vision}</dd>
            </dl>
            <p className="text-xs text-muted-foreground">{d.superAdmin.aiEnvNote}</p>
            {aiConfigured() && <TestAiButton />}
          </CardBody>
        </Card>
        <ProfileSettings ctx={ctx} />
      </div>
    </>
  );
}
