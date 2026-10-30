import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { getI18n } from "@/lib/i18n/server";
import { getSessionContext } from "@/lib/auth/session";

export const metadata = { title: "Регистрация" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  if (await getSessionContext()) redirect(invite ? `/onboarding?invite=${encodeURIComponent(invite)}` : "/app");
  const { d } = await getI18n();
  return (
    <AuthCard
      title={d.auth.registerTitle}
      subtitle={d.auth.registerSubtitle}
      footer={<>{d.auth.haveAccount} <Link className="text-primary hover:underline" href={invite ? `/login?next=${encodeURIComponent(`/onboarding?invite=${invite}`)}` : "/login"}>{d.auth.login}</Link></>}
    >
      <RegisterForm invite={invite} />
    </AuthCard>
  );
}
