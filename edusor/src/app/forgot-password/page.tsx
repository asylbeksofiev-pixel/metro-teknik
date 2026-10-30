import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "@/components/auth/password-forms";
import { getI18n } from "@/lib/i18n/server";

export default async function ForgotPage() {
  const { d } = await getI18n();
  return (
    <AuthCard title={d.auth.forgotTitle} subtitle={d.auth.forgotSubtitle} footer={<Link className="text-primary hover:underline" href="/login">{d.auth.login}</Link>}>
      <ForgotForm />
    </AuthCard>
  );
}
