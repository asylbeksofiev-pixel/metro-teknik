import { z } from "zod";

export const QUESTION_TYPES = [
  "single_choice",
  "multiple_choice",
  "true_false",
  "short_text",
  "numeric",
  "matching",
  "ordering",
  "fill_blanks",
  "essay",
  "file_upload",
  "image_answer",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Types graded deterministically on the server (no AI). short_text is deterministic when it matches an accepted answer. */
export const OBJECTIVE_TYPES: readonly QuestionType[] = ["single_choice", "multiple_choice", "true_false", "numeric", "matching", "ordering", "fill_blanks"];
export const SUBJECTIVE_TYPES: readonly QuestionType[] = ["essay", "file_upload", "image_answer"];

const id = z.string().min(1).max(64);
const text = z.string().max(4000);
const image = z.object({ path: z.string().max(500), alt: z.string().max(300).default("") });
const item = z.object({ id, text: z.string().max(1000) });
const scoring = z.enum(["all_or_nothing", "partial"]).default("all_or_nothing");

const base = { prompt: text, images: z.array(image).max(10).default([]) };

// ---------------------------------------------------------------------------
// Student-visible content (stored in snapshots; never contains answers)
// ---------------------------------------------------------------------------
export const contentSchemas = {
  single_choice: z.object({ ...base, options: z.array(item).max(12) }),
  multiple_choice: z.object({ ...base, options: z.array(item).max(12) }),
  true_false: z.object({ ...base }),
  short_text: z.object({ ...base }),
  numeric: z.object({ ...base, unit: z.string().max(40).default("") }),
  matching: z.object({ ...base, left: z.array(item).max(12), right: z.array(item).max(12) }),
  ordering: z.object({ ...base, items: z.array(item).max(12) }),
  fill_blanks: z.object({ ...base }), // blanks are marked in the prompt as [[1]], [[2]] …
  essay: z.object({ ...base, minWords: z.number().int().min(0).max(5000).nullable().default(null), maxWords: z.number().int().min(0).max(10000).nullable().default(null) }),
  file_upload: z.object({ ...base, maxFiles: z.number().int().min(1).max(5).default(1) }),
  image_answer: z.object({ ...base, maxFiles: z.number().int().min(1).max(5).default(1) }),
} satisfies Record<QuestionType, z.ZodTypeAny>;

// ---------------------------------------------------------------------------
// Secret answer keys
// ---------------------------------------------------------------------------
export const answerKeySchemas = {
  single_choice: z.object({ correct: id.nullable().default(null) }),
  multiple_choice: z.object({ correct: z.array(id).default([]), scoring }),
  true_false: z.object({ correct: z.boolean().nullable().default(null) }),
  short_text: z.object({ accepted: z.array(z.string().max(500)).max(30).default([]), caseSensitive: z.boolean().default(false) }),
  numeric: z.object({ value: z.number().nullable().default(null), tolerance: z.number().min(0).default(0) }),
  matching: z.object({ pairs: z.record(id, id).default({}), scoring }),
  ordering: z.object({ order: z.array(id).default([]), scoring }),
  fill_blanks: z.object({
    blanks: z.record(z.string().regex(/^\d{1,2}$/), z.array(z.string().max(300)).max(20)).default({}),
    caseSensitive: z.boolean().default(false),
    scoring: z.enum(["all_or_nothing", "partial"]).default("partial"),
  }),
  essay: z.object({ referenceAnswer: z.string().max(10000).default("") }),
  file_upload: z.object({ referenceAnswer: z.string().max(10000).default("") }),
  image_answer: z.object({ referenceAnswer: z.string().max(10000).default("") }),
} satisfies Record<QuestionType, z.ZodTypeAny>;

export const rubricSchema = z.object({
  criteria: z
    .array(
      z.object({
        id,
        title: z.string().min(1).max(300),
        description: z.string().max(2000).default(""),
        maxPoints: z.number().min(0).max(100),
      }),
    )
    .max(20),
});
export type Rubric = z.infer<typeof rubricSchema>;

// ---------------------------------------------------------------------------
// Student responses
// ---------------------------------------------------------------------------
export const responseSchemas = {
  single_choice: z.object({ optionId: id.nullable().optional() }),
  multiple_choice: z.object({ optionIds: z.array(id).max(12).optional() }),
  true_false: z.object({ value: z.boolean().nullable().optional() }),
  short_text: z.object({ text: z.string().max(2000).optional() }),
  numeric: z.object({ value: z.string().max(60).optional() }),
  matching: z.object({ pairs: z.record(id, id).optional() }),
  ordering: z.object({ order: z.array(id).max(12).optional() }),
  fill_blanks: z.object({ blanks: z.record(z.string().regex(/^\d{1,2}$/), z.string().max(300)).optional() }),
  essay: z.object({ text: z.string().max(30000).optional() }),
  file_upload: z.object({ fileIds: z.array(z.string().uuid()).max(5).optional() }),
  image_answer: z.object({ fileIds: z.array(z.string().uuid()).max(5).optional() }),
} satisfies Record<QuestionType, z.ZodTypeAny>;

export type Content<T extends QuestionType = QuestionType> = z.infer<(typeof contentSchemas)[T]>;
export type AnswerKey<T extends QuestionType = QuestionType> = z.infer<(typeof answerKeySchemas)[T]>;
export type Response<T extends QuestionType = QuestionType> = z.infer<(typeof responseSchemas)[T]>;

/** Full editable question, as stored in assessment_questions / question_bank_items. */
export type EditableQuestion = {
  id?: string;
  type: QuestionType;
  content: Record<string, unknown>;
  answer_key: Record<string, unknown>;
  rubric: Rubric | null;
  explanation: string | null;
  points: number;
  topic: string | null;
  learning_objective: string | null;
};

/** Question as presented to a student (from the snapshot). */
export type SnapshotQuestion = {
  id: string;
  sectionId: string | null;
  position: number;
  type: QuestionType;
  content: Record<string, unknown>;
  points: number;
  topic: string | null;
  learningObjective: string | null;
};

export function blankIds(prompt: string): string[] {
  const ids = new Set<string>();
  for (const m of prompt.matchAll(/\[\[(\d{1,2})\]\]/g)) if (m[1]) ids.add(m[1]);
  return [...ids];
}

export function isQuestionType(v: unknown): v is QuestionType {
  return typeof v === "string" && (QUESTION_TYPES as readonly string[]).includes(v);
}

export function isEmptyResponse(type: QuestionType, response: unknown): boolean {
  const parsed = responseSchemas[type].safeParse(response ?? {});
  if (!parsed.success) return true;
  const r = parsed.data as Record<string, unknown>;
  switch (type) {
    case "single_choice":
      return !r.optionId;
    case "multiple_choice":
      return !(r.optionIds as string[] | undefined)?.length;
    case "true_false":
      return typeof r.value !== "boolean";
    case "short_text":
    case "essay":
      return !String(r.text ?? "").trim();
    case "numeric":
      return !String(r.value ?? "").trim();
    case "matching":
      return Object.keys((r.pairs as object | undefined) ?? {}).length === 0;
    case "ordering":
      return !(r.order as string[] | undefined)?.length;
    case "fill_blanks":
      return Object.values((r.blanks as Record<string, string> | undefined) ?? {}).every((v) => !v.trim());
    case "file_upload":
    case "image_answer":
      return !(r.fileIds as string[] | undefined)?.length;
  }
}

/**
 * Validates an editable question before saving/publishing. Returns a dictionary key
 * under `questions.validation` describing the first problem, or null if valid.
 */
export function validateQuestion(q: Pick<EditableQuestion, "type" | "content" | "answer_key">): string | null {
  const c = contentSchemas[q.type].safeParse(q.content);
  const k = answerKeySchemas[q.type].safeParse(q.answer_key);
  if (!c.success || !k.success) return "prompt";
  const content = c.data as Record<string, unknown>;
  const key = k.data as Record<string, unknown>;
  if (!String(content.prompt ?? "").trim()) return "prompt";
  switch (q.type) {
    case "single_choice":
    case "multiple_choice": {
      const options = content.options as { id: string; text: string }[];
      if (options.length < 2) return "options";
      if (options.some((o) => !o.text.trim())) return "optionText";
      const ids = new Set(options.map((o) => o.id));
      if (q.type === "single_choice") return key.correct && ids.has(key.correct as string) ? null : "correct";
      const correct = key.correct as string[];
      return correct.length > 0 && correct.every((c) => ids.has(c)) ? null : "correct";
    }
    case "true_false":
      return typeof key.correct === "boolean" ? null : "correct";
    case "short_text":
      return (key.accepted as string[]).some((a) => a.trim()) ? null : "accepted";
    case "numeric":
      return typeof key.value === "number" && Number.isFinite(key.value) ? null : "numeric";
    case "matching": {
      const left = content.left as { id: string; text: string }[];
      const right = content.right as { id: string; text: string }[];
      if (left.length < 2 || right.length < 2) return "pairs";
      if ([...left, ...right].some((o) => !o.text.trim())) return "optionText";
      const pairs = key.pairs as Record<string, string>;
      const rightIds = new Set(right.map((r) => r.id));
      return left.every((l) => pairs[l.id] && rightIds.has(pairs[l.id]!)) ? null : "pairs";
    }
    case "ordering": {
      const items = content.items as { id: string; text: string }[];
      if (items.length < 2) return "items";
      if (items.some((o) => !o.text.trim())) return "optionText";
      const order = key.order as string[];
      return order.length === items.length && items.every((i) => order.includes(i.id)) ? null : "items";
    }
    case "fill_blanks": {
      const ids = blankIds(String(content.prompt));
      const blanks = key.blanks as Record<string, string[]>;
      return ids.length > 0 && ids.every((b) => blanks[b]?.some((a) => a.trim())) ? null : "blanks";
    }
    case "essay":
    case "file_upload":
    case "image_answer":
      return null;
  }
}

export function newItemId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultQuestion(type: QuestionType): Omit<EditableQuestion, "id"> {
  const o = () => ({ id: newItemId(), text: "" });
  const content: Record<QuestionType, Record<string, unknown>> = {
    single_choice: { prompt: "", images: [], options: [o(), o(), o(), o()] },
    multiple_choice: { prompt: "", images: [], options: [o(), o(), o(), o()] },
    true_false: { prompt: "", images: [] },
    short_text: { prompt: "", images: [] },
    numeric: { prompt: "", images: [], unit: "" },
    matching: { prompt: "", images: [], left: [o(), o(), o()], right: [o(), o(), o()] },
    ordering: { prompt: "", images: [], items: [o(), o(), o()] },
    fill_blanks: { prompt: "", images: [] },
    essay: { prompt: "", images: [], minWords: null, maxWords: null },
    file_upload: { prompt: "", images: [], maxFiles: 1 },
    image_answer: { prompt: "", images: [], maxFiles: 1 },
  };
  const key: Record<QuestionType, Record<string, unknown>> = {
    single_choice: { correct: null },
    multiple_choice: { correct: [], scoring: "partial" },
    true_false: { correct: null },
    short_text: { accepted: [], caseSensitive: false },
    numeric: { value: null, tolerance: 0 },
    matching: { pairs: {}, scoring: "partial" },
    ordering: { order: [], scoring: "partial" },
    fill_blanks: { blanks: {}, caseSensitive: false, scoring: "partial" },
    essay: { referenceAnswer: "" },
    file_upload: { referenceAnswer: "" },
    image_answer: { referenceAnswer: "" },
  };
  const subjective = SUBJECTIVE_TYPES.includes(type);
  return {
    type,
    content: content[type],
    answer_key: key[type],
    rubric: subjective ? { criteria: [{ id: newItemId(), title: "", description: "", maxPoints: 1 }] } : null,
    explanation: null,
    points: 1,
    topic: null,
    learning_objective: null,
  };
}
