import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, ShieldCheck, BarChart3, Lightbulb } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getSessionContext } from "@/lib/auth/session";
import { Brand } from "@/components/shell/sidebar";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { Button } from "@/components/ui/button";

export default async function LandingPage() {
  if (await getSessionContext()) redirect("/app");
  const { d } = await getI18n();
  const features = [
    { icon: FileText, title: d.landing.f1Title, text: d.landing.f1Text },
    { icon: ShieldCheck, title: d.landing.f2Title, text: d.landing.f2Text },
    { icon: BarChart3, title: d.landing.f3Title, text: d.landing.f3Text },
    { icon: Lightbulb, title: d.landing.f4Title, text: d.landing.f4Text },
  ];
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
        <Brand />
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button asChild variant="ghost" size="sm"><Link href="/login">{d.landing.ctaLogin}</Link></Button>
        </div>
      </header>
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-12 pt-10 sm:px-8 sm:pt-16">
          <p className="mb-3 text-sm font-medium text-primary">{d.meta.tagline}</p>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{d.landing.title}</h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">{d.landing.subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/login">{d.landing.ctaLogin}</Link></Button>
            <Button asChild size="lg" variant="secondary"><Link href="/register">{d.landing.ctaRegister}</Link></Button>
          </div>
        </section>
        <section className="border-t border-border bg-background">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-lg border border-border bg-surface p-5 shadow-card">
                <div className="mb-3 flex size-9 items-center justify-center rounded-md bg-primary-soft text-primary"><Icon className="size-[18px]" /></div>
                <h2 className="text-[15px] font-semibold">{title}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
          <p className="pb-10 text-center text-sm text-muted-foreground">{d.landing.note}</p>
        </section>
      </main>
      <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:underline">{d.legal.privacyTitle}</Link> · <Link href="/terms" className="hover:underline">{d.legal.termsTitle}</Link>
      </footer>
    </div>
  );
}
