import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { getI18n } from "@/lib/i18n/server";
import { getSessionContext } from "@/lib/auth/session";

export const metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  if (await getSessionContext()) redirect("/app");
  const { d } = await getI18n();
  return (
    <AuthCard
      title={d.auth.loginTitle}
      subtitle={d.auth.loginSubtitle}
      footer={<>{d.auth.noAccount} <Link className="text-primary hover:underline" href="/register">{d.auth.register}</Link></>}
    >
      <LoginForm next={sp.next} linkError={sp.error === "link"} />
    </AuthCard>
  );
}
