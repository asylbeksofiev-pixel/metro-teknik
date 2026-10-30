import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Replaces {name} placeholders in a translated string. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (key in vars ? String(vars[key]) : `{${key}}`));
}

export function formatPoints(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

export function percent(score: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((score / max) * 1000) / 10;
}

/** Names are stored as "Фамилия Имя [Отчество]"; greet by name (and patronymic). */
export function greetingName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? parts.slice(1).join(" ") : (parts[0] ?? "");
}
