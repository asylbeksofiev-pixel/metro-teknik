"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, FileText, Paperclip, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { QuestionType } from "@/lib/assessment/schema";
import { InlineRich, RichText } from "@/components/content/rich-text";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, fmt } from "@/lib/utils";

type Item = { id: string; text: string };
export type ViewQuestion = { id: string; type: QuestionType; content: Record<string, unknown>; points: number };
export type UploadedFile = { id: string; name: string };
type Resp = Record<string, unknown>;

function ordered<T extends { id: string }>(items: T[], order?: string[]): T[] {
  if (!order?.length) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = order.map((id) => byId.get(id)).filter((x): x is T => !!x);
  for (const i of items) if (!order.includes(i.id)) out.push(i);
  return out;
}

export function QuestionImages({ images }: { images: { path: string; alt: string }[] }) {
  if (!images?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {images.map((img) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={img.path} src={`/api/media?path=${encodeURIComponent(img.path)}`} alt={img.alt} className="max-h-72 max-w-full rounded-md border border-border object-contain" loading="lazy" />
      ))}
    </div>
  );
}

export function QuestionView({
  question,
  response,
  onChange,
  optionOrder,
  disabled,
  files,
  onUpload,
  onRemoveFile,
}: {
  question: ViewQuestion;
  response: Resp;
  onChange: (r: Resp) => void;
  optionOrder?: string[];
  disabled?: boolean;
  files?: UploadedFile[];
  onUpload?: (file: File) => Promise<void>;
  onRemoveFile?: (fileId: string) => void;
}) {
  const { d } = useI18n();
  const c = question.content;
  const prompt = String(c.prompt ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const name = `q-${question.id}`;

  const body = (() => {
    switch (question.type) {
      case "single_choice":
      case "multiple_choice": {
        const opts = ordered((c.options as Item[]) ?? [], optionOrder);
        const multi = question.type === "multiple_choice";
        const selected = multi ? ((response.optionIds as string[] | undefined) ?? []) : [response.optionId as string | undefined];
        return (
          <fieldset className="flex flex-col gap-2" disabled={disabled}>
            <legend className="mb-1 text-xs text-muted-foreground">{multi ? d.attempt.selectMany : d.attempt.selectOne}</legend>
            {opts.map((o, i) => {
              const checked = selected.includes(o.id);
              return (
                <label key={o.id} className={cn("flex cursor-pointer items-start gap-3 rounded-md border px-3.5 py-2.5 text-sm transition-colors", checked ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-muted/60")}>
                  <input
                    type={multi ? "checkbox" : "radio"}
                    name={name}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                    checked={checked}
                    onChange={(e) => {
                      if (!multi) onChange({ optionId: o.id });
                      else {
                        const cur = (response.optionIds as string[] | undefined) ?? [];
                        onChange({ optionIds: e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id) });
                      }
                    }}
                  />
                  <span className="text-xs font-medium text-muted-foreground">{String.fromCharCode(65 + i)}.</span>
                  <InlineRich text={o.text} />
                </label>
              );
            })}
          </fieldset>
        );
      }
      case "true_false":
        return (
          <fieldset className="flex flex-wrap gap-3" disabled={disabled}>
            {[true, false].map((v) => (
              <label key={String(v)} className={cn("flex min-w-32 cursor-pointer items-center gap-2 rounded-md border px-4 py-2.5 text-sm", response.value === v ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-muted/60")}>
                <input type="radio" name={name} className="size-4 accent-[var(--color-primary)]" checked={response.value === v} onChange={() => onChange({ value: v })} />
                {v ? d.questions.trueLabel : d.questions.falseLabel}
              </label>
            ))}
          </fieldset>
        );
      case "short_text":
        return <Input aria-label={d.attempt.yourAnswer} placeholder={d.attempt.typeAnswer} maxLength={2000} disabled={disabled} value={(response.text as string) ?? ""} onChange={(e) => onChange({ text: e.target.value })} />;
      case "numeric":
        return (
          <div className="flex items-center gap-2">
            <Input aria-label={d.attempt.yourAnswer} placeholder={d.attempt.typeNumber} inputMode="decimal" maxLength={60} className="max-w-48" disabled={disabled} value={(response.value as string) ?? ""} onChange={(e) => onChange({ value: e.target.value })} />
            {c.unit ? <span className="text-sm text-muted-foreground">{String(c.unit)}</span> : null}
          </div>
        );
      case "matching": {
        const left = (c.left as Item[]) ?? [];
        const right = ordered((c.right as Item[]) ?? [], optionOrder);
        const pairs = (response.pairs as Record<string, string> | undefined) ?? {};
        return (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">{d.attempt.matchHint}</p>
            {left.map((l, i) => (
              <div key={l.id} className="grid items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 sm:grid-cols-[1fr_minmax(0,1fr)]">
                <span className="text-sm"><span className="mr-1 text-xs font-medium text-muted-foreground">{i + 1}.</span><InlineRich text={l.text} /></span>
                <NativeSelect aria-label={`${i + 1}`} disabled={disabled} value={pairs[l.id] ?? ""} onChange={(e) => {
                  const next = { ...pairs };
                  if (e.target.value) next[l.id] = e.target.value;
                  else delete next[l.id];
                  onChange({ pairs: next });
                }}>
                  <option value="">—</option>
                  {right.map((r, j) => <option key={r.id} value={r.id}>{String.fromCharCode(65 + j)}. {r.text.replace(/\$/g, "")}</option>)}
                </NativeSelect>
              </div>
            ))}
            <div className="mt-1 flex flex-wrap gap-2">
              {right.map((r, j) => <span key={r.id} className="rounded bg-muted px-2 py-1 text-sm"><b className="mr-1 text-xs">{String.fromCharCode(65 + j)}.</b><InlineRich text={r.text} /></span>)}
            </div>
          </div>
        );
      }
      case "ordering": {
        const items = (c.items as Item[]) ?? [];
        const current = ordered(items, (response.order as string[] | undefined) ?? optionOrder);
        const move = (i: number, dir: -1 | 1) => {
          const next = current.map((x) => x.id);
          const [x] = next.splice(i, 1);
          next.splice(i + dir, 0, x!);
          onChange({ order: next });
        };
        return (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">{d.attempt.orderHint}</p>
            <ol className="flex flex-col gap-2">
              {current.map((it, i) => (
                <li key={it.id} className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
                  <span className="w-5 text-xs font-medium text-muted-foreground">{i + 1}.</span>
                  <span className="flex-1 text-sm"><InlineRich text={it.text} /></span>
                  <Button type="button" size="icon" variant="ghost" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={d.assessment.moveUp}><ArrowUp /></Button>
                  <Button type="button" size="icon" variant="ghost" disabled={disabled || i === current.length - 1} onClick={() => move(i, 1)} aria-label={d.assessment.moveDown}><ArrowDown /></Button>
                </li>
              ))}
            </ol>
          </div>
        );
      }
      case "fill_blanks":
        return null; // inputs are rendered inline in the prompt
      case "essay": {
        const text = (response.text as string) ?? "";
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        return (
          <div className="flex flex-col gap-1">
            <Textarea aria-label={d.attempt.yourAnswer} rows={10} maxLength={30000} disabled={disabled} value={text} onChange={(e) => onChange({ text: e.target.value })} />
            <p className="text-right text-xs text-muted-foreground">
              {fmt(d.attempt.words, { n: words })}
              {c.minWords ? ` · ${d.questions.minWords}: ${String(c.minWords)}` : ""}
              {c.maxWords ? ` · ${d.questions.maxWords}: ${String(c.maxWords)}` : ""}
            </p>
          </div>
        );
      }
      case "file_upload":
      case "image_answer": {
        const max = Number(c.maxFiles ?? 1);
        const list = files ?? [];
        return (
          <div className="flex flex-col gap-2">
            {list.map((f) => (
              <div key={f.id} className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
                <FileText className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate">{f.name}</span>
                {onRemoveFile && !disabled && <Button type="button" size="icon" variant="ghost" onClick={() => onRemoveFile(f.id)} aria-label={d.attempt.removeFile}><Trash2 /></Button>}
              </div>
            ))}
            {onUpload && !disabled && list.length < max && (
              <label className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input px-4 py-6 text-sm text-muted-foreground hover:bg-muted/60", uploading && "pointer-events-none opacity-60")}>
                <Paperclip className="size-4" />
                {uploading ? d.attempt.uploading : question.type === "image_answer" ? d.attempt.uploadPhoto : d.attempt.uploadFile}
                <input
                  type="file"
                  className="sr-only"
                  accept={question.type === "image_answer" ? "image/jpeg,image/png" : "application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
                  capture={question.type === "image_answer" ? "environment" : undefined}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setUploading(true);
                    setUploadError(false);
                    try { await onUpload(f); } catch { setUploadError(true); } finally { setUploading(false); }
                  }}
                />
              </label>
            )}
            <p className="text-xs text-muted-foreground">{d.attempt.fileTypes}</p>
            {uploadError && <p role="alert" className="text-xs text-danger">{d.attempt.uploadFailed}</p>}
          </div>
        );
      }
    }
  })();

  const blanks = (response.blanks as Record<string, string> | undefined) ?? {};
  return (
    <div className="flex flex-col gap-4">
      <RichText
        text={prompt}
        className="text-[15px]"
        renderBlank={
          question.type === "fill_blanks"
            ? (id, key) => (
                <input
                  key={key}
                  aria-label={fmt(d.questions.blankN, { n: id })}
                  disabled={disabled}
                  value={blanks[id] ?? ""}
                  maxLength={300}
                  onChange={(e) => onChange({ blanks: { ...blanks, [id]: e.target.value } })}
                  className="mx-1 inline-block h-8 w-36 rounded-md border border-input bg-surface px-2 align-baseline text-sm"
                />
              )
            : undefined
        }
      />
      <QuestionImages images={(c.images as { path: string; alt: string }[]) ?? []} />
      {body}
    </div>
  );
}
