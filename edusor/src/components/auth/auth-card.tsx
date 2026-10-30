import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/components/shell/sidebar";
import { LanguageSwitcher } from "@/components/shell/language-switcher";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Link href="/"><Brand /></Link>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:pt-12">
        <div className="w-full max-w-md">
          <div className="rounded-lg border border-border bg-surface p-6 shadow-card sm:p-8">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
