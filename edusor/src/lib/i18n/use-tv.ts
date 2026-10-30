"use client";

import { useI18n } from "./client";

/** Translates validation/error codes returned by zod schemas and server actions. */
export function useTranslateError() {
  const { d } = useI18n();
  return (code: string | undefined | null): string | null => {
    if (!code) return null;
    const v = d.validation as Record<string, string>;
    const e = d.errors as Record<string, string>;
    const a = d.auth as Record<string, string>;
    return v[code] ?? e[code] ?? a[code] ?? d.errors.generic;
  };
}
