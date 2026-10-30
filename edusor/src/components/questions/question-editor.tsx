"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import { QUESTION_TYPES, SUBJECTIVE_TYPES, blankIds, defaultQuestion, newItemId, validateQuestion, type QuestionType, type Rubric } from "@/lib/assessment/schema";
import type { ActionResult } from "@/lib/actions/result";
import type { QuestionInput } from "@/lib/actions/assessments";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { RichText } from "@/components/content/rich-text";
import { QuestionView } from "./question-view";
import { cn, fmt } from "@/lib/utils";

type Item = { id: string; text: string };
type Pair = { leftId: string; left: string; rightId: string; right: string };

export type EditorQuestion = {
  id?: string;
  sectionId?: string | null;
  type: QuestionType;
  content: Record<string, unknown>;
  answer_key: Record<string, unknown>;
  rubric: Rubric | null;
  explanation: string | null;
  points: number;
  topic: string | null;
  learning_objective: string | null;
  reveal_after_release?: boolean;
  ai_uncertain?: boolean;
};

export type BankMeta = { subjectId: string | null; grade: number | null; difficulty: "easy" | "medium" | "hard"; isShared: boolean };

/** Editor-friendly state: matching as pairs and ordering in correct order. */
type State = {
  type: QuestionType;
  prompt: string;
  images: { path: string; alt: string }[];
  options: Item[];
  correctSingle: string | null;
  correctMulti: string[];
  correctBool: boolean | null;
  accepted: string;
  caseSensitive: boolean;
  numValue: string;
  tolerance: string;
  unit: string;
  pairs: Pair[];
  items: Item[];
  blanks: Record<string, string>;
  scoring: "all_or_nothing" | "partial";
  minWords: string;
  maxWords: string;
  maxFiles: string;
  reference: string;
  rubric: { id: string; title: string; description: string; maxPoints: string }[];
  explanation: string;
  points: string;
  topic: string;
  objective: string;
  reveal: boolean;
};

function toState(q: EditorQuestion): State {
  const c = q.content as Record<string, unknown>;
  const k = q.answer_key as Record<string, unknown>;
  const items = (c.items as Item[] | undefined) ?? [];
  const order = (k.order as string[] | undefined) ?? [];
  const orderedItems = order.length ? [...items].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)) : items;
  const left = (c.left as Item[] | undefined) ?? [];
  const right = (c.right as Item[] | undefined) ?? [];
  const keyPairs = (k.pairs as Record<string, string> | undefined) ?? {};
  const pairs: Pair[] = left.map((l, i) => {
    const r = right.find((x) => x.id === keyPairs[l.id]) ?? right[i] ?? { id: newItemId(), text: "" };
    return { leftId: l.id, left: l.text, rightId: r.id, right: r.text };
  });
  const blanks = Object.fromEntries(Object.entries((k.blanks as Record<string, string[]> | undefined) ?? {}).map(([id, v]) => [id, v.join("\n")]));
  return {
    type: q.type,
    prompt: String(c.prompt ?? ""),
    images: (c.images as State["images"] | undefined) ?? [],
    options: (c.options as Item[] | undefined) ?? [],
    correctSingle: (k.correct as string | null | undefined) && q.type === "single_choice" ? (k.correct as string) : null,
    correctMulti: q.type === "multiple_choice" ? ((k.correct as string[] | undefined) ?? []) : [],
    correctBool: q.type === "true_false" ? ((k.correct as boolean | null | undefined) ?? null) : null,
    accepted: ((k.accepted as string[] | undefined) ?? []).join("\n"),
    caseSensitive: Boolean(k.caseSensitive),
    numValue: k.value === null || k.value === undefined ? "" : String(k.value),
    tolerance: k.tolerance === undefined ? "0" : String(k.tolerance),
    unit: String(c.unit ?? ""),
    pairs: pairs.length ? pairs : [],
    items: orderedItems,
    blanks,
    scoring: (k.scoring as State["scoring"] | undefined) ?? "partial",
    minWords: c.minWords ? String(c.minWords) : "",
    maxWords: c.maxWords ? String(c.maxWords) : "",
    maxFiles: String(c.maxFiles ?? 1),
    reference: String(k.referenceAnswer ?? ""),
    rubric: (q.rubric?.criteria ?? []).map((cr) => ({ ...cr, maxPoints: String(cr.maxPoints) })),
    explanation: q.explanation ?? "",
    points: String(q.points),
    topic: q.topic ?? "",
    objective: q.learning_objective ?? "",
    reveal: q.reveal_after_release ?? true,
  };
}

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

function fromState(s: State): Omit<EditorQuestion, "id" | "sectionId"> {
  const base = { prompt: s.prompt, images: s.images };
  let content: Record<string, unknown> = base;
  let key: Record<string, unknown> = {};
  switch (s.type) {
    case "single_choice":
      content = { ...base, options: s.options };
      key = { correct: s.correctSingle };
      break;
    case "multiple_choice":
      content = { ...base, options: s.options };
      key = { correct: s.correctMulti.filter((c) => s.options.some((o) => o.id === c)), scoring: s.scoring };
      break;
    case "true_false":
      key = { correct: s.correctBool };
      break;
    case "short_text":
      key = { accepted: s.accepted.split("\n").map((a) => a.trim()).filter(Boolean), caseSensitive: s.caseSensitive };
      break;
    case "numeric":
      content = { ...base, unit: s.unit };
      key = { value: num(s.numValue), tolerance: Math.abs(num(s.tolerance) ?? 0) };
      break;
    case "matching":
      content = { ...base, left: s.pairs.map((p) => ({ id: p.leftId, text: p.left })), right: s.pairs.map((p) => ({ id: p.rightId, text: p.right })) };
      key = { pairs: Object.fromEntries(s.pairs.map((p) => [p.leftId, p.rightId])), scoring: s.scoring };
      break;
    case "ordering":
      content = { ...base, items: s.items };
      key = { order: s.items.map((i) => i.id), scoring: s.scoring };
      break;
    case "fill_blanks": {
      const ids = blankIds(s.prompt);
      key = {
        blanks: Object.fromEntries(ids.map((id) => [id, (s.blanks[id] ?? "").split("\n").map((v) => v.trim()).filter(Boolean)])),
        caseSensitive: s.caseSensitive,
        scoring: s.scoring,
      };
      break;
    }
    case "essay":
      content = { ...base, minWords: num(s.minWords), maxWords: num(s.maxWords) };
      key = { referenceAnswer: s.reference };
      break;
    case "file_upload":
    case "image_answer":
      content = { ...base, maxFiles: Math.min(5, Math.max(1, num(s.maxFiles) ?? 1)) };
      key = { referenceAnswer: s.reference };
      break;
  }
  const usesRubric = SUBJECTIVE_TYPES.includes(s.type) || s.type === "short_text";
  const rubric = usesRubric && s.rubric.length ? { criteria: s.rubric.filter((r) => r.title.trim()).map((r) => ({ id: r.id, title: r.title.trim(), description: r.description, maxPoints: num(r.maxPoints) ?? 0 })) } : null;
  return {
    type: s.type,
    content,
    answer_key: key,
    rubric,
    explanation: s.explanation || null,
    points: num(s.points) ?? 1,
    topic: s.topic || null,
    learning_objective: s.objective || null,
    reveal_after_release: s.reveal,
  };
}

function ListEditor({ items, onChange, renderExtra, label, addLabel, ordered }: { items: Item[]; onChange: (v: Item[]) => void; renderExtra?: (item: Item) => React.ReactNode; label: string; addLabel: string; ordered?: boolean }) {
  const { d } = useI18n();
  const move = (i: number, dir: -1 | 1) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + dir, 0, x!);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {items.map((item, i) => (
        <div key={item.id} className="flex items-center gap-2">
          {renderExtra?.(item)}
          {ordered && <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}.</span>}
          <Input value={item.text} aria-label={fmt(d.questions.option, { n: i + 1 })} placeholder={fmt(d.questions.option, { n: i + 1 })} onChange={(e) => onChange(items.map((x) => (x.id === item.id ? { ...x, text: e.target.value } : x)))} />
          {ordered && (
            <>
              <Button type="button" size="icon" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={d.assessment.moveUp}><ArrowUp /></Button>
              <Button type="button" size="icon" variant="ghost" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={d.assessment.moveDown}><ArrowDown /></Button>
            </>
          )}
          <Button type="button" size="icon" variant="ghost" disabled={items.length <= 2} onClick={() => onChange(items.filter((x) => x.id !== item.id))} aria-label={d.common.remove}><Trash2 /></Button>
        </div>
      ))}
      {items.length < 12 && <div><Button type="button" size="sm" variant="soft" onClick={() => onChange([...items, { id: newItemId(), text: "" }])}><Plus /> {addLabel}</Button></div>}
    </div>
  );
}

export function QuestionEditor({
  initial,
  onSave,
  onCancel,
  bankMeta,
  subjects,
  allowTypeChange = true,
}: {
  initial?: EditorQuestion;
  onSave: (q: QuestionInput & Partial<BankMeta>) => Promise<ActionResult<{ id: string; warning: string | null }>>;
  onCancel: () => void;
  bankMeta?: BankMeta;
  subjects?: { id: string; name: string }[];
  allowTypeChange?: boolean;
}) {
  const { d } = useI18n();
  const te = useTranslateError();
  const [s, setS] = useState<State>(() => toState(initial ?? { ...defaultQuestion("single_choice") }));
  const [meta, setMeta] = useState<BankMeta | undefined>(bankMeta);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((p) => ({ ...p, [k]: v }));

  const built = useMemo(() => fromState(s), [s]);
  const problem = validateQuestion(built);
  const blanks = s.type === "fill_blanks" ? blankIds(s.prompt) : [];
  const rubricSum = s.rubric.reduce((acc, r) => acc + (num(r.maxPoints) ?? 0), 0);
  const usesRubric = SUBJECTIVE_TYPES.includes(s.type) || s.type === "short_text";

  const changeType = (type: QuestionType) => {
    const fresh = toState({ ...defaultQuestion(type) });
    setS({ ...fresh, prompt: s.prompt, images: s.images, points: s.points, topic: s.topic, objective: s.objective, explanation: s.explanation });
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { path?: string; error?: string };
      if (!res.ok || !json.path) throw new Error(json.error ?? "uploadFailed");
      set("images", [...s.images, { path: json.path, alt: "" }]);
    } catch {
      setError("uploadFailed");
    } finally {
      setUploading(false);
    }
  };

  const save = () =>
    start(async () => {
      setError(null);
      const res = await onSave({
        id: initial?.id,
        sectionId: initial?.sectionId ?? null,
        type: built.type,
        content: built.content,
        answerKey: built.answer_key,
        rubric: built.rubric,
        explanation: built.explanation,
        points: built.points,
        topic: built.topic,
        learningObjective: built.learning_objective,
        revealAfterRelease: built.reveal_after_release ?? true,
        ...(meta ?? {}),
      });
      if (!res.ok) setError(res.error);
    });

  return (
    <div className="flex flex-col gap-5">
      {initial?.ai_uncertain && <Alert tone="warning">{d.questions.uncertain}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <Field label={d.questions.type} htmlFor="q-type">
          <NativeSelect id="q-type" value={s.type} disabled={!allowTypeChange} onChange={(e) => changeType(e.target.value as QuestionType)}>
            {QUESTION_TYPES.map((t) => <option key={t} value={t}>{d.questions.types[t]}</option>)}
          </NativeSelect>
        </Field>
        <Field label={d.questions.points} htmlFor="q-points">
          <Input id="q-points" inputMode="decimal" value={s.points} onChange={(e) => set("points", e.target.value)} />
        </Field>
      </div>

      <Field label={d.questions.prompt} htmlFor="q-prompt" hint={s.type === "fill_blanks" ? d.questions.blanksHint : d.questions.promptHint}>
        <Textarea id="q-prompt" rows={4} value={s.prompt} onChange={(e) => set("prompt", e.target.value)} />
      </Field>
      {s.prompt.includes("$") || s.prompt.includes("|") ? <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm"><RichText text={s.prompt} /></div> : null}

      <div className="flex flex-col gap-2">
        <Label>{d.questions.images}</Label>
        <div className="flex flex-wrap gap-3">
          {s.images.map((img, i) => (
            <div key={img.path} className="flex w-40 flex-col gap-1">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/media?path=${encodeURIComponent(img.path)}`} alt={img.alt} className="h-24 w-40 rounded-md border border-border object-cover" />
                <button type="button" className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white" aria-label={d.common.remove} onClick={() => set("images", s.images.filter((_, j) => j !== i))}><X className="size-3.5" /></button>
              </div>
              <Input value={img.alt} placeholder={d.questions.imageAlt} className="h-8 text-xs" onChange={(e) => set("images", s.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} />
            </div>
          ))}
          {s.images.length < 10 && (
            <label className={cn("flex h-24 w-40 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input text-xs text-muted-foreground hover:bg-muted", uploading && "opacity-60")}>
              <ImagePlus className="size-5" />
              {uploading ? d.attempt.uploading : d.questions.addImage}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); e.target.value = ""; }} />
            </label>
          )}
        </div>
      </div>

      {/* Type-specific editors */}
      {(s.type === "single_choice" || s.type === "multiple_choice") && (
        <>
          <ListEditor
            label={d.questions.options}
            addLabel={d.questions.addOption}
            items={s.options}
            onChange={(v) => set("options", v)}
            renderExtra={(item) =>
              s.type === "single_choice" ? (
                <input type="radio" name="correct" className="size-4 accent-[var(--color-success)]" aria-label={d.questions.correct} checked={s.correctSingle === item.id} onChange={() => set("correctSingle", item.id)} />
              ) : (
                <input type="checkbox" className="size-4 accent-[var(--color-success)]" aria-label={d.questions.correct} checked={s.correctMulti.includes(item.id)} onChange={(e) => set("correctMulti", e.target.checked ? [...s.correctMulti, item.id] : s.correctMulti.filter((x) => x !== item.id))} />
              )
            }
          />
          <p className="-mt-3 text-xs text-muted-foreground">{d.questions.correct}: {s.type === "single_choice" ? "◉" : "☑"}</p>
        </>
      )}
      {s.type === "true_false" && (
        <fieldset className="flex gap-4">
          <legend className="mb-2 text-[13px] font-medium">{d.questions.correctAnswer}</legend>
          {[true, false].map((v) => (
            <label key={String(v)} className="flex items-center gap-2 text-sm">
              <input type="radio" name="tf" className="size-4" checked={s.correctBool === v} onChange={() => set("correctBool", v)} /> {v ? d.questions.trueLabel : d.questions.falseLabel}
            </label>
          ))}
        </fieldset>
      )}
      {s.type === "short_text" && (
        <>
          <Field label={d.questions.acceptedAnswers} htmlFor="q-acc"><Textarea id="q-acc" rows={3} value={s.accepted} onChange={(e) => set("accepted", e.target.value)} /></Field>
          <Switch id="q-cs" checked={s.caseSensitive} onCheckedChange={(v) => set("caseSensitive", v)} label={d.questions.caseSensitive} />
        </>
      )}
      {s.type === "numeric" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={d.questions.numericValue} htmlFor="q-num"><Input id="q-num" inputMode="decimal" value={s.numValue} onChange={(e) => set("numValue", e.target.value)} /></Field>
          <Field label={d.questions.tolerance} htmlFor="q-tol"><Input id="q-tol" inputMode="decimal" value={s.tolerance} onChange={(e) => set("tolerance", e.target.value)} /></Field>
          <Field label={d.questions.unit} htmlFor="q-unit"><Input id="q-unit" value={s.unit} onChange={(e) => set("unit", e.target.value)} /></Field>
        </div>
      )}
      {s.type === "matching" && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_1fr_36px] gap-2 text-[13px] font-medium"><span>{d.questions.leftColumn}</span><span>{d.questions.rightColumn}</span><span /></div>
          {s.pairs.map((p, i) => (
            <div key={p.leftId} className="grid grid-cols-[1fr_1fr_36px] gap-2">
              <Input value={p.left} aria-label={`${d.questions.leftColumn} ${i + 1}`} onChange={(e) => set("pairs", s.pairs.map((x) => (x.leftId === p.leftId ? { ...x, left: e.target.value } : x)))} />
              <Input value={p.right} aria-label={`${d.questions.rightColumn} ${i + 1}`} onChange={(e) => set("pairs", s.pairs.map((x) => (x.leftId === p.leftId ? { ...x, right: e.target.value } : x)))} />
              <Button type="button" size="icon" variant="ghost" disabled={s.pairs.length <= 2} onClick={() => set("pairs", s.pairs.filter((x) => x.leftId !== p.leftId))} aria-label={d.common.remove}><Trash2 /></Button>
            </div>
          ))}
          {s.pairs.length < 12 && <div><Button type="button" size="sm" variant="soft" onClick={() => set("pairs", [...s.pairs, { leftId: newItemId(), left: "", rightId: newItemId(), right: "" }])}><Plus /> {d.questions.addPair}</Button></div>}
        </div>
      )}
      {s.type === "ordering" && <ListEditor label={d.questions.items} addLabel={d.questions.addItem} items={s.items} onChange={(v) => set("items", v)} ordered />}
      {s.type === "fill_blanks" && (
        <div className="flex flex-col gap-3">
          {blanks.length === 0 && <p className="text-xs text-warning">{d.questions.validation.blanks}</p>}
          {blanks.map((id) => (
            <Field key={id} label={`${fmt(d.questions.blankN, { n: id })} — ${d.questions.acceptedAnswers}`} htmlFor={`q-b-${id}`}>
              <Textarea id={`q-b-${id}`} rows={2} value={s.blanks[id] ?? ""} onChange={(e) => set("blanks", { ...s.blanks, [id]: e.target.value })} />
            </Field>
          ))}
          <Switch id="q-cs2" checked={s.caseSensitive} onCheckedChange={(v) => set("caseSensitive", v)} label={d.questions.caseSensitive} />
        </div>
      )}
      {["multiple_choice", "matching", "ordering", "fill_blanks"].includes(s.type) && (
        <Field label={d.questions.scoring} htmlFor="q-scoring">
          <NativeSelect id="q-scoring" value={s.scoring} onChange={(e) => set("scoring", e.target.value as State["scoring"])}>
            <option value="partial">{d.questions.scoringPartial}</option>
            <option value="all_or_nothing">{d.questions.scoringAll}</option>
          </NativeSelect>
        </Field>
      )}
      {s.type === "essay" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={d.questions.minWords} htmlFor="q-minw"><Input id="q-minw" inputMode="numeric" value={s.minWords} onChange={(e) => set("minWords", e.target.value)} /></Field>
          <Field label={d.questions.maxWords} htmlFor="q-maxw"><Input id="q-maxw" inputMode="numeric" value={s.maxWords} onChange={(e) => set("maxWords", e.target.value)} /></Field>
        </div>
      )}
      {(s.type === "file_upload" || s.type === "image_answer") && (
        <Field label={d.questions.maxFiles} htmlFor="q-maxf"><Input id="q-maxf" inputMode="numeric" value={s.maxFiles} onChange={(e) => set("maxFiles", e.target.value)} className="w-24" /></Field>
      )}
      {SUBJECTIVE_TYPES.includes(s.type) && (
        <Field label={d.questions.referenceAnswer} htmlFor="q-ref"><Textarea id="q-ref" rows={3} value={s.reference} onChange={(e) => set("reference", e.target.value)} /></Field>
      )}

      {usesRubric && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <Label>{d.questions.rubric}</Label>
          {s.rubric.map((r, i) => (
            <div key={r.id} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_80px_36px]">
              <Input value={r.title} placeholder={d.questions.criterion} aria-label={`${d.questions.criterion} ${i + 1}`} onChange={(e) => set("rubric", s.rubric.map((x) => (x.id === r.id ? { ...x, title: e.target.value } : x)))} />
              <Input value={r.description} placeholder={d.questions.criterionDescription} aria-label={d.questions.criterionDescription} onChange={(e) => set("rubric", s.rubric.map((x) => (x.id === r.id ? { ...x, description: e.target.value } : x)))} />
              <Input value={r.maxPoints} inputMode="decimal" aria-label={d.questions.points} onChange={(e) => set("rubric", s.rubric.map((x) => (x.id === r.id ? { ...x, maxPoints: e.target.value } : x)))} />
              <Button type="button" size="icon" variant="ghost" onClick={() => set("rubric", s.rubric.filter((x) => x.id !== r.id))} aria-label={d.common.remove}><Trash2 /></Button>
            </div>
          ))}
          <div><Button type="button" size="sm" variant="soft" onClick={() => set("rubric", [...s.rubric, { id: newItemId(), title: "", description: "", maxPoints: "1" }])}><Plus /> {d.questions.addCriterion}</Button></div>
          {s.rubric.length > 0 && Math.abs(rubricSum - (num(s.points) ?? 0)) > 0.001 && <p className="text-xs text-warning">{fmt(d.questions.rubricMismatch, { sum: rubricSum, points: s.points })}</p>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={d.questions.topic} htmlFor="q-topic"><Input id="q-topic" value={s.topic} maxLength={200} onChange={(e) => set("topic", e.target.value)} /></Field>
        <Field label={d.questions.learningObjective} htmlFor="q-obj"><Input id="q-obj" value={s.objective} maxLength={300} onChange={(e) => set("objective", e.target.value)} /></Field>
      </div>
      <Field label={d.questions.explanation} htmlFor="q-expl"><Textarea id="q-expl" rows={2} value={s.explanation} onChange={(e) => set("explanation", e.target.value)} /></Field>
      {!meta && <Switch id="q-reveal" checked={s.reveal} onCheckedChange={(v) => set("reveal", v)} label={d.questions.revealAfterRelease} />}

      {meta && (
        <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3">
          <Field label={d.common.subject} htmlFor="b-subj">
            <NativeSelect id="b-subj" value={meta.subjectId ?? ""} onChange={(e) => setMeta({ ...meta, subjectId: e.target.value || null })}>
              <option value="">—</option>
              {subjects?.map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label={d.common.grade} htmlFor="b-grade">
            <NativeSelect id="b-grade" value={meta.grade ?? ""} onChange={(e) => setMeta({ ...meta, grade: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {Array.from({ length: 11 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </NativeSelect>
          </Field>
          <Field label={d.questions.difficulty} htmlFor="b-diff">
            <NativeSelect id="b-diff" value={meta.difficulty} onChange={(e) => setMeta({ ...meta, difficulty: e.target.value as BankMeta["difficulty"] })}>
              {(["easy", "medium", "hard"] as const).map((x) => <option key={x} value={x}>{d.questions.difficulties[x]}</option>)}
            </NativeSelect>
          </Field>
          <div className="sm:col-span-3"><Switch id="b-shared" checked={meta.isShared} onCheckedChange={(v) => setMeta({ ...meta, isShared: v })} label={d.questions.bankShared} /></div>
        </div>
      )}

      {problem && <Alert tone="warning">{(d.questions.validation as Record<string, string>)[problem]}</Alert>}
      {error && <Alert tone="danger">{te(error)}</Alert>}

      {preview && (
        <div className="rounded-lg border border-primary/30 bg-primary-soft/30 p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-primary">{d.assessment.previewTitle}</p>
          <QuestionView question={{ id: "preview", type: built.type, content: built.content, points: built.points }} response={{}} onChange={() => {}} />
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={() => setPreview((p) => !p)}><Eye /> {d.assessment.preview}</Button>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>{d.common.cancel}</Button>
          <Button type="button" onClick={save} loading={pending}>{d.common.save}</Button>
        </div>
      </div>
    </div>
  );
}
