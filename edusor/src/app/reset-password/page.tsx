import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetForm } from "@/components/auth/password-forms";
import { getI18n } from "@/lib/i18n/server";
import { getSessionContext } from "@/lib/auth/session";

export default async function ResetPage() {
  if (!(await getSessionContext())) redirect("/forgot-password");
  const { d } = await getI18n();
  return (
    <AuthCard title={d.auth.resetTitle}>
      <ResetForm />
    </AuthCard>
  );
}
