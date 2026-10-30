/** Pure analytics helpers. All inputs come from real database rows; nothing is estimated. */

export const MIN_SAMPLE_FOR_DIFFICULTY = 5;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

/** Percent buckets 0–9, 10–19 … 90–100. */
export function distribution(percents: number[]): { bucket: string; count: number }[] {
  const buckets = Array.from({ length: 10 }, (_, i) => ({ bucket: `${i * 10}–${i === 9 ? 100 : i * 10 + 9}`, count: 0 }));
  for (const p of percents) buckets[Math.min(9, Math.max(0, Math.floor(p / 10)))]!.count++;
  return buckets;
}

export type ScoreRow = { result: "correct" | "incorrect" | "partial" | "unanswered" | "pending"; points: number | null; max: number };

export type QuestionStats = {
  responses: number;
  correct: number;
  incorrect: number;
  partial: number;
  unanswered: number;
  pending: number;
  accuracy: number | null;
  avgPoints: number | null;
  difficulty: { flagged: boolean; reasons: ("lowAccuracy" | "highUnanswered" | "commonWrong" | "lowRubric")[]; smallSample: boolean };
};

export function questionStats(rows: ScoreRow[], extra: { commonWrongShare?: number; rubricShare?: number | null } = {}): QuestionStats {
  const c = { correct: 0, incorrect: 0, partial: 0, unanswered: 0, pending: 0 };
  for (const r of rows) c[r.result]++;
  const graded = rows.filter((r) => r.points !== null);
  const avgPoints = mean(graded.map((r) => r.points!));
  const max = rows[0]?.max ?? 0;
  // Accuracy = share of available points earned on graded responses (partial credit counts proportionally).
  const accuracy = graded.length && max > 0 ? (graded.reduce((s, r) => s + r.points!, 0) / (graded.length * max)) * 100 : null;
  const reasons: QuestionStats["difficulty"]["reasons"] = [];
  const smallSample = rows.length < MIN_SAMPLE_FOR_DIFFICULTY;
  if (!smallSample) {
    if (accuracy !== null && accuracy < 40) reasons.push("lowAccuracy");
    if (c.unanswered / rows.length >= 0.3) reasons.push("highUnanswered");
    if ((extra.commonWrongShare ?? 0) >= 0.4) reasons.push("commonWrong");
    if (extra.rubricShare !== undefined && extra.rubricShare !== null && extra.rubricShare < 0.4) reasons.push("lowRubric");
  }
  return { responses: rows.length, ...c, accuracy: round1(accuracy), avgPoints: round1(avgPoints), difficulty: { flagged: reasons.length > 0, reasons, smallSample } };
}

/** Counts how many students picked each option; identifies the most common wrong option. */
export function optionDistribution(options: { id: string }[], picks: string[][], correct: string[]) {
  const counts = new Map(options.map((o) => [o.id, 0]));
  for (const p of picks) for (const id of p) if (counts.has(id)) counts.set(id, counts.get(id)! + 1);
  const total = picks.length;
  const rows = options.map((o) => ({ id: o.id, count: counts.get(o.id)!, share: total ? counts.get(o.id)! / total : 0, correct: correct.includes(o.id) }));
  const wrong = rows.filter((r) => !r.correct && r.count > 0).sort((a, b) => b.count - a.count)[0] ?? null;
  return { rows, mostCommonWrong: wrong, total };
}

/** Aggregates points by topic. Topics with no graded data are omitted (never fabricated). */
export function topicPerformance(rows: { topic: string | null; points: number | null; max: number }[]) {
  const map = new Map<string, { earned: number; max: number; n: number }>();
  for (const r of rows) {
    if (!r.topic || r.points === null || r.max <= 0) continue;
    const t = map.get(r.topic) ?? { earned: 0, max: 0, n: 0 };
    t.earned += r.points;
    t.max += r.max;
    t.n++;
    map.set(r.topic, t);
  }
  return [...map.entries()].map(([topic, t]) => ({ topic, percent: round1((t.earned / t.max) * 100)!, responses: t.n })).sort((a, b) => a.percent - b.percent);
}

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralize spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: unknown[][]): string {
  return "﻿" + rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}
