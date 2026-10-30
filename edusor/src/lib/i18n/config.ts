import { ru, type Dictionary } from "./dictionaries/ru";
import { kk } from "./dictionaries/kk";

export const LOCALES = ["ru", "kk"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALE_COOKIE = "edusor_locale";

export const dictionaries: Record<Locale, Dictionary> = { ru, kk };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export type { Dictionary };
