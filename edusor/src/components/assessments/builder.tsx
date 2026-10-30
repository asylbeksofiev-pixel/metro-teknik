"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, Library, Pencil, Plus, Save, Sparkles, Trash2, AlertTriangle } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import { validateQuestion, type QuestionType } from "@/lib/assessment/schema";
import {
  addBankItemsToAssessmentAction,
  deleteQuestionAction,
  deleteSectionAction,
  duplicateQuestionAction,
  moveQuestionToSectionAction,
  reorderQuestionsAction,
  saveQuestionAction,
  saveQuestionToBankAction,
  saveSectionAction,
} from "@/lib/actions/assessments";
import { QuestionEditor, type EditorQuestion } from "@/components/questions/question-editor";
import { RichText } from "@/components/content/rich-text";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, EmptyState } from "@/components/ui/misc";
import { formatPoints, fmt } from "@/lib/utils";

export type BuilderQuestion = EditorQuestion & { id: string; position: number; section_id: string | null; ai_generated: boolean };
export type BuilderSection = { id: string; title: string; position: number };
export type BankPickItem = { id: string; type: QuestionType; prompt: string; topic: string | null; points: number };

export function AssessmentBuilder({ assessmentId, questions, sections, bank }: { assessmentId: string; questions: BuilderQuestion[]; sections: BuilderSection[]; bank: BankPickItem[] }) {
  const { d } = useI18n();
  const te = useTranslateError();
  const router = useRouter();
  const [editing, setEditing] = useState<EditorQuestion | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [sectionTitle, setSectionTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "generic");
      router.refresh();
    });

  const ordered = [...questions].sort((a, b) => a.position - b.position);
  const total = ordered.reduce((s, q) => s + Number(q.points), 0);
  const move = (index: number, dir: -1 | 1) => {
    const ids = ordered.map((q) => q.id);
    const [x] = ids.splice(index, 1);
    ids.splice(index + dir, 0, x!);
    run(() => reorderQuestionsAction(assessmentId, ids));
  };

  const groups: { section: BuilderSection | null; items: BuilderQuestion[] }[] = [
    { section: null, items: ordered.filter((q) => !q.section_id) },
    ...[...sections].sort((a, b) => a.position - b.position).map((s) => ({ section: s, items: ordered.filter((q) => q.section_id === s.id) })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {d.assessment.questionCount}: <b className="text-foreground">{ordered.length}</b> · {d.assessment.totalPoints}: <b className="text-foreground">{formatPoints(total)}</b>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => { setPicked([]); setBankOpen(true); }}><Library /> {d.assessment.addFromBank}</Button>
          <Button onClick={() => setEditing({ type: "single_choice", content: { prompt: "", images: [], options: [{ id: "a1", text: "" }, { id: "b2", text: "" }, { id: "c3", text: "" }, { id: "d4", text: "" }] }, answer_key: { correct: null }, rubric: null, explanation: null, points: 1, topic: null, learning_objective: null })}>
            <Plus /> {d.assessment.addQuestion}
          </Button>
        </div>
      </div>
      {error && <Alert tone="danger">{error.startsWith("invalid_question") ? error : te(error)}</Alert>}

      {ordered.length === 0 && <div className="rounded-lg border border-dashed border-border bg-surface"><EmptyState title={d.assessment.emptyBuilder} /></div>}

      {groups.map(({ section, items }) =>
        section === null && items.length === 0 ? null : (
          <div key={section?.id ?? "none"} className="flex flex-col gap-3">
            {section && (
              <div className="flex items-center justify-between gap-2 border-b border-border pb-2 pt-2">
                <h3 className="text-sm font-semibold">{section.title}</h3>
                <Button size="sm" variant="ghost" onClick={() => run(() => deleteSectionAction(assessmentId, section.id))}><Trash2 /> {d.common.delete}</Button>
              </div>
            )}
            {items.map((q) => {
              const index = ordered.findIndex((x) => x.id === q.id);
              const problem = validateQuestion(q);
              return (
                <div key={q.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded bg-muted text-xs font-semibold">{index + 1}</span>
                    <Badge tone="primary">{d.questions.types[q.type]}</Badge>
                    <Badge>{formatPoints(Number(q.points))} {d.common.pointsShort}</Badge>
                    {q.topic && <span className="text-xs text-muted-foreground">{q.topic}</span>}
                    {q.ai_generated && <Badge tone="info"><Sparkles className="size-3" /> {d.common.aiGenerated}</Badge>}
                    {q.ai_uncertain && <Badge tone="warning"><AlertTriangle className="size-3" /> {d.questions.uncertain}</Badge>}
                    {problem && <Badge tone="warning">{(d.questions.validation as Record<string, string>)[problem]}</Badge>}
                  </div>
                  <RichText text={String(q.content.prompt ?? "")} className="line-clamp-4 text-sm" />
                  <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border pt-3">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(q)}><Pencil /> {d.common.edit}</Button>
                    <Button size="sm" variant="ghost" onClick={() => run(() => duplicateQuestionAction(assessmentId, q.id))}><Copy /> {d.common.duplicate}</Button>
                    <Button size="sm" variant="ghost" onClick={() => run(() => saveQuestionToBankAction(assessmentId, q.id))}><Save /> {d.assessment.saveToBank}</Button>
                    <Button size="icon" variant="ghost" disabled={index === 0 || pending} onClick={() => move(index, -1)} aria-label={d.assessment.moveUp}><ArrowUp /></Button>
                    <Button size="icon" variant="ghost" disabled={index === ordered.length - 1 || pending} onClick={() => move(index, 1)} aria-label={d.assessment.moveDown}><ArrowDown /></Button>
                    {sections.length > 0 && (
                      <NativeSelect aria-label={d.assessment.sectionTitle} className="h-8 w-auto text-xs" value={q.section_id ?? ""} onChange={(e) => run(() => moveQuestionToSectionAction(assessmentId, q.id, e.target.value || null))}>
                        <option value="">{d.assessment.noSection}</option>
                        {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                      </NativeSelect>
                    )}
                    <Button size="sm" variant="ghost" className="ml-auto text-danger" onClick={() => run(() => deleteQuestionAction(assessmentId, q.id))}><Trash2 /> {d.common.delete}</Button>
                  </div>
                </div>
              );
            })}
          </div>
        ),
      )}

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (sectionTitle.trim()) run(async () => { const r = await saveSectionAction(assessmentId, { title: sectionTitle }); if (r.ok) setSectionTitle(""); return r; }); }}>
        <Input value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} placeholder={d.assessment.sectionTitle} aria-label={d.assessment.sectionTitle} maxLength={200} className="max-w-sm" />
        <Button type="submit" variant="secondary" disabled={!sectionTitle.trim()}><Plus /> {d.assessment.sectionAdd}</Button>
      </form>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing.id ? d.common.edit : d.assessment.addQuestion} className="max-w-3xl">
            <QuestionEditor
              initial={editing}
              onCancel={() => setEditing(null)}
              onSave={async (input) => {
                const res = await saveQuestionAction(assessmentId, input);
                if (res.ok) { setEditing(null); router.refresh(); }
                return res;
              }}
            />
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={bankOpen} onOpenChange={setBankOpen}>
        <DialogContent
          title={d.assessment.addFromBank}
          className="max-w-2xl"
          footer={
            <Button disabled={!picked.length} loading={pending} onClick={() => run(async () => { const r = await addBankItemsToAssessmentAction(assessmentId, picked); if (r.ok) setBankOpen(false); return r; })}>
              {d.common.add} ({picked.length})
            </Button>
          }
        >
          {bank.length === 0 ? <EmptyState title={d.questions.bankEmpty} /> : (
            <ul className="flex flex-col divide-y divide-border">
              {bank.map((b) => (
                <li key={b.id}>
                  <label className="flex cursor-pointer items-start gap-3 py-2.5">
                    <input type="checkbox" className="mt-1 size-4" checked={picked.includes(b.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, b.id] : picked.filter((x) => x !== b.id))} />
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex flex-wrap gap-1.5"><Badge tone="primary">{d.questions.types[b.type]}</Badge><Badge>{formatPoints(b.points)} {d.common.pointsShort}</Badge>{b.topic && <span className="text-xs text-muted-foreground">{b.topic}</span>}</span>
                      <RichText text={b.prompt} className="line-clamp-2 text-sm" />
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{fmt(d.common.showing, { from: bank.length ? 1 : 0, to: bank.length, total: bank.length })}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
