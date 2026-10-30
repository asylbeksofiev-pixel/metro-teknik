import { answerKeySchemas, blankIds, contentSchemas, isEmptyResponse, responseSchemas, type QuestionType } from "./schema";

export type ScoreResult = "correct" | "incorrect" | "partial" | "unanswered" | "pending";

export type AutoGrade = {
  /** Points awarded, or null when the answer needs AI/teacher review. */
  points: number | null;
  result: ScoreResult;
  needsReview: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function normalizeText(value: string, caseSensitive: boolean): string {
  const collapsed = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return caseSensitive ? collapsed : collapsed.toLocaleLowerCase("ru");
}

/** Parses numbers written with either decimal comma or point ("3,5", "-2.75", "1 000"). */
export function parseLocaleNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/[\s ]/g, "").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function fromFraction(fraction: number, maxPoints: number, partialAllowed: boolean): AutoGrade {
  if (fraction >= 1) return { points: maxPoints, result: "correct", needsReview: false };
  if (!partialAllowed || fraction <= 0) return { points: 0, result: "incorrect", needsReview: false };
  return { points: round2(maxPoints * fraction), result: "partial", needsReview: false };
}

/**
 * Deterministic grading. Never calls AI. Subjective questions (and short answers that do not
 * match an accepted answer) are returned as `pending` for AI suggestion + teacher approval.
 */
export function gradeResponse(type: QuestionType, rawKey: unknown, rawResponse: unknown, maxPoints: number, rawContent?: unknown): AutoGrade {
  if (isEmptyResponse(type, rawResponse)) return { points: 0, result: "unanswered", needsReview: false };

  const keyParsed = answerKeySchemas[type].safeParse(rawKey ?? {});
  const resParsed = responseSchemas[type].safeParse(rawResponse ?? {});
  if (!keyParsed.success || !resParsed.success) return { points: null, result: "pending", needsReview: true };
  const key = keyParsed.data as Record<string, unknown>;
  const res = resParsed.data as Record<string, unknown>;

  switch (type) {
    case "single_choice":
      if (!key.correct) return { points: null, result: "pending", needsReview: true };
      return fromFraction(res.optionId === key.correct ? 1 : 0, maxPoints, false);

    case "true_false":
      if (typeof key.correct !== "boolean") return { points: null, result: "pending", needsReview: true };
      return fromFraction(res.value === key.correct ? 1 : 0, maxPoints, false);

    case "multiple_choice": {
      const correct = new Set(key.correct as string[]);
      if (correct.size === 0) return { points: null, result: "pending", needsReview: true };
      const chosen = new Set(res.optionIds as string[]);
      const hits = [...chosen].filter((c) => correct.has(c)).length;
      const wrong = chosen.size - hits;
      if (hits === correct.size && wrong === 0) return fromFraction(1, maxPoints, true);
      if (key.scoring !== "partial") return fromFraction(0, maxPoints, false);
      // Each wrong selection cancels one correct one; prevents "select everything".
      return fromFraction(Math.max(0, hits - wrong) / correct.size, maxPoints, true);
    }

    case "numeric": {
      if (typeof key.value !== "number") return { points: null, result: "pending", needsReview: true };
      const n = parseLocaleNumber(String(res.value ?? ""));
      if (n === null) return fromFraction(0, maxPoints, false);
      const tolerance = Math.max(Number(key.tolerance) || 0, 1e-9 * Math.max(1, Math.abs(key.value)));
      return fromFraction(Math.abs(n - key.value) <= tolerance ? 1 : 0, maxPoints, false);
    }

    case "matching": {
      const pairs = key.pairs as Record<string, string>;
      const lefts = Object.keys(pairs);
      if (lefts.length === 0) return { points: null, result: "pending", needsReview: true };
      const given = (res.pairs as Record<string, string> | undefined) ?? {};
      const hits = lefts.filter((l) => given[l] === pairs[l]).length;
      return fromFraction(hits / lefts.length, maxPoints, key.scoring === "partial");
    }

    case "ordering": {
      const order = key.order as string[];
      if (order.length < 2) return { points: null, result: "pending", needsReview: true };
      const given = (res.order as string[] | undefined) ?? [];
      if (given.length === order.length && given.every((v, i) => v === order[i])) return fromFraction(1, maxPoints, true);
      if (key.scoring !== "partial") return fromFraction(0, maxPoints, false);
      // Partial credit: share of adjacent pairs kept in the correct relative order.
      const pos = new Map(given.map((v, i) => [v, i]));
      let kept = 0;
      for (let i = 0; i < order.length - 1; i++) {
        const a = pos.get(order[i]!);
        const b = pos.get(order[i + 1]!);
        if (a !== undefined && b !== undefined && a < b) kept++;
      }
      return fromFraction(kept / (order.length - 1), maxPoints, true);
    }

    case "fill_blanks": {
      const blanks = key.blanks as Record<string, string[]>;
      const content = contentSchemas.fill_blanks.safeParse(rawContent ?? {});
      const ids = content.success ? blankIds(content.data.prompt) : Object.keys(blanks);
      const graded = ids.filter((id) => blanks[id]?.length);
      if (graded.length === 0) return { points: null, result: "pending", needsReview: true };
      const given = (res.blanks as Record<string, string> | undefined) ?? {};
      const cs = key.caseSensitive === true;
      const hits = graded.filter((id) => {
        const answer = normalizeText(given[id] ?? "", cs);
        return answer !== "" && blanks[id]!.some((acc) => normalizeText(acc, cs) === answer);
      }).length;
      return fromFraction(hits / graded.length, maxPoints, key.scoring !== "all_or_nothing");
    }

    case "short_text": {
      const accepted = (key.accepted as string[]).filter((a) => a.trim());
      const cs = key.caseSensitive === true;
      const answer = normalizeText(String(res.text ?? ""), cs);
      if (accepted.some((a) => normalizeText(a, cs) === answer)) return fromFraction(1, maxPoints, false);
      // Not an exact match: may still be correct (synonym, wording) → AI suggestion + teacher review.
      return { points: null, result: "pending", needsReview: true };
    }

    case "essay":
    case "file_upload":
    case "image_answer":
      return { points: null, result: "pending", needsReview: true };
  }
}

export function resultFromPoints(points: number, max: number): ScoreResult {
  if (points >= max) return "correct";
  if (points <= 0) return "incorrect";
  return "partial";
}

/**
 * Prepares content for storage so that student-visible data never leaks the key:
 * ordering items and matching right-hand options are stored in id order, not answer order.
 */
export function sanitizeContentForStorage(type: QuestionType, content: Record<string, unknown>): Record<string, unknown> {
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  if (type === "ordering" && Array.isArray(content.items)) {
    return { ...content, items: [...(content.items as { id: string }[])].sort(byId) };
  }
  if (type === "matching" && Array.isArray(content.right)) {
    return { ...content, right: [...(content.right as { id: string }[])].sort(byId) };
  }
  return content;
}

/** Kazakhstan criteria-based mark from a percentage (used for display only). */
export function markFromPercent(pct: number): 2 | 3 | 4 | 5 {
  if (pct >= 85) return 5;
  if (pct >= 65) return 4;
  if (pct >= 40) return 3;
  return 2;
}
