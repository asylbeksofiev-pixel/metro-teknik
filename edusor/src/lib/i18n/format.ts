import type { Locale } from "./config";

const TZ = "Asia/Almaty";

function intlLocale(locale: Locale) {
  return locale === "kk" ? "kk-KZ" : "ru-RU";
}

export function formatDateTime(value: string | Date | null | undefined, locale: Locale): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(value));
}

export function formatDate(value: string | Date | null | undefined, locale: Locale): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "2-digit", month: "short", year: "numeric", timeZone: TZ }).format(
    new Date(value),
  );
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function subjectName(subject: { name_ru: string; name_kk: string } | null | undefined, locale: Locale): string {
  if (!subject) return "—";
  return locale === "kk" ? subject.name_kk : subject.name_ru;
}

/** Converts a "datetime-local" value entered in Almaty time to ISO (UTC). */
export function almatyLocalToIso(value: string): string | null {
  if (!value) return null;
  // Kazakhstan uses a single UTC+5 offset (since March 2024), no DST.
  const date = new Date(`${value}:00+05:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isoToAlmatyLocal(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(new Date(value).getTime() + 5 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}
