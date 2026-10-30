"use client";

import { useTransition } from "react";
import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { setLocaleAction } from "@/lib/actions/locale";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, d } = useI18n();
  const [pending, start] = useTransition();
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-md border border-border bg-surface p-0.5", className)} role="group" aria-label={d.common.language}>
      <Languages className="ml-1.5 size-3.5 text-muted-foreground" aria-hidden />
      {(["ru", "kk"] as const).map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending}
          aria-pressed={locale === l}
          onClick={() => start(() => setLocaleAction(l))}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium uppercase",
            locale === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {l === "ru" ? "Рус" : "Қаз"}
        </button>
      ))}
    </div>
  );
}
