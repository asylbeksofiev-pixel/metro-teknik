import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, dictionaries, isLocale, type Locale } from "./config";
import { getSessionContext } from "@/lib/auth/session";

/** Locale priority: profile preference → cookie → default (ru). */
export const getLocale = cache(async (): Promise<Locale> => {
  const ctx = await getSessionContext();
  if (ctx && isLocale(ctx.profile.locale)) return ctx.profile.locale;
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
});

export async function getI18n() {
  const locale = await getLocale();
  return { locale, d: dictionaries[locale] };
}
