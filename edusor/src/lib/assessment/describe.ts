import { answerKeySchemas, blankIds, contentSchemas, responseSchemas, type QuestionType } from "./schema";

type Item = { id: string; text: string };
const letter = (i: number) => String.fromCharCode(65 + i);

function optionLabel(options: Item[], id: string | null | undefined): string {
  const i = options.findIndex((o) => o.id === id);
  return i < 0 ? "—" : `${letter(i)}. ${options[i]!.text}`;
}

/** Human-readable student response (labels follow the canonical option order). */
export function describeResponse(type: QuestionType, rawContent: unknown, rawResponse: unknown, trueLabel = "Верно", falseLabel = "Неверно"): string {
  const c = contentSchemas[type].safeParse(rawContent ?? {});
  const r = responseSchemas[type].safeParse(rawResponse ?? {});
  if (!c.success || !r.success) return "";
  const content = c.data as Record<string, unknown>;
  const res = r.data as Record<string, unknown>;
  switch (type) {
    case "single_choice":
      return res.optionId ? optionLabel(content.options as Item[], res.optionId as string) : "";
    case "multiple_choice":
      return ((res.optionIds as string[] | undefined) ?? []).map((id) => optionLabel(content.options as Item[], id)).join("; ");
    case "true_false":
      return typeof res.value === "boolean" ? (res.value ? trueLabel : falseLabel) : "";
    case "short_text":
    case "essay":
      return String(res.text ?? "");
    case "numeric":
      return `${String(res.value ?? "")}${content.unit ? ` ${String(content.unit)}` : ""}`.trim();
    case "matching": {
      const left = content.left as Item[];
      const right = content.right as Item[];
      const pairs = (res.pairs as Record<string, string> | undefined) ?? {};
      return left.map((l, i) => `${i + 1}. ${l.text} → ${right.find((x) => x.id === pairs[l.id])?.text ?? "—"}`).join("\n");
    }
    case "ordering": {
      const items = content.items as Item[];
      return ((res.order as string[] | undefined) ?? []).map((id, i) => `${i + 1}. ${items.find((x) => x.id === id)?.text ?? "?"}`).join("\n");
    }
    case "fill_blanks": {
      const blanks = (res.blanks as Record<string, string> | undefined) ?? {};
      return blankIds(String(content.prompt)).map((id) => `[${id}] ${blanks[id] ?? ""}`).join("; ");
    }
    case "file_upload":
    case "image_answer":
      return "";
  }
}

/** Human-readable correct answer from the key (null when the type has no single key). */
export function describeKey(type: QuestionType, rawContent: unknown, rawKey: unknown, trueLabel = "Верно", falseLabel = "Неверно"): string | null {
  const c = contentSchemas[type].safeParse(rawContent ?? {});
  const k = answerKeySchemas[type].safeParse(rawKey ?? {});
  if (!c.success || !k.success) return null;
  const content = c.data as Record<string, unknown>;
  const key = k.data as Record<string, unknown>;
  switch (type) {
    case "single_choice":
      return key.correct ? optionLabel(content.options as Item[], key.correct as string) : null;
    case "multiple_choice":
      return (key.correct as string[]).map((id) => optionLabel(content.options as Item[], id)).join("; ") || null;
    case "true_false":
      return typeof key.correct === "boolean" ? (key.correct ? trueLabel : falseLabel) : null;
    case "short_text":
      return (key.accepted as string[]).join(" / ") || null;
    case "numeric":
      return typeof key.value === "number" ? `${key.value}${Number(key.tolerance) ? ` ± ${String(key.tolerance)}` : ""}${content.unit ? ` ${String(content.unit)}` : ""}` : null;
    case "matching": {
      const left = content.left as Item[];
      const right = content.right as Item[];
      const pairs = key.pairs as Record<string, string>;
      return left.map((l, i) => `${i + 1}. ${l.text} → ${right.find((x) => x.id === pairs[l.id])?.text ?? "—"}`).join("\n");
    }
    case "ordering": {
      const items = content.items as Item[];
      return (key.order as string[]).map((id, i) => `${i + 1}. ${items.find((x) => x.id === id)?.text ?? "?"}`).join("\n") || null;
    }
    case "fill_blanks": {
      const blanks = key.blanks as Record<string, string[]>;
      return Object.entries(blanks).map(([id, v]) => `[${id}] ${v.join(" / ")}`).join("; ") || null;
    }
    case "essay":
    case "file_upload":
    case "image_answer":
      return String(key.referenceAnswer ?? "") || null;
  }
}
