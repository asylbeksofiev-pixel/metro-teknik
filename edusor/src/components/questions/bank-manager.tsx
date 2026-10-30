"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Trash2, FolderInput } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import { addBankItemsToAssessmentAction, deleteBankItemAction, duplicateBankItemAction, saveBankItemAction } from "@/lib/actions/assessments";
import { defaultQuestion, type QuestionType, type Rubric } from "@/lib/assessment/schema";
import { QuestionEditor, type BankMeta, type EditorQuestion } from "./question-editor";
import { RichText } from "@/components/content/rich-text";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, EmptyState } from "@/components/ui/misc";
import { formatPoints } from "@/lib/utils";

export type BankRow = {
  id: string;
  type: QuestionType;
  content: Record<string, unknown>;
  answer_key: Record<string, unknown>;
  rubric: Rubric | null;
  explanation: string | null;
  points: number;
  topic: string | null;
  learning_objective: string | null;
  subject_id: string | null;
  subject_name: string;
  grade: number | null;
  difficulty: "easy" | "medium" | "hard";
  is_shared: boolean;
  is_own: boolean;
};

export function BankManager({ rows, subjects, drafts }: { rows: BankRow[]; subjects: { id: string; name: string }[]; drafts: { id: string; title: string }[] }) {
  const { d } = useI18n();
  const te = useTranslateError();
  const router = useRouter();
  const [editing, setEditing] = useState<{ q: EditorQuestion; meta: BankMeta } | null>(null);
  const [target, setTarget] = useState(drafts[0]?.id ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      const res = await fn();
      setMessage(res.ok ? (success ? { tone: "success", text: success } : null) : { tone: "danger", text: te(res.error) ?? "" });
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <NativeSelect aria-label={d.questions.selectAssessment} value={target} onChange={(e) => setTarget(e.target.value)} className="w-auto min-w-64">
            <option value="">{d.questions.selectAssessment}</option>
            {drafts.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </NativeSelect>
        </div>
        <Button onClick={() => setEditing({ q: { ...defaultQuestion("single_choice") }, meta: { subjectId: subjects[0]?.id ?? null, grade: null, difficulty: "medium", isShared: false } })}><Plus /> {d.questions.bankNew}</Button>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {rows.length === 0 ? <div className="rounded-lg border border-dashed border-border bg-surface"><EmptyState title={d.questions.bankEmpty} /></div> : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="primary">{d.questions.types[r.type]}</Badge>
                <Badge>{formatPoints(r.points)} {d.common.pointsShort}</Badge>
                <Badge tone={r.difficulty === "hard" ? "danger" : r.difficulty === "easy" ? "success" : "warning"}>{d.questions.difficulties[r.difficulty]}</Badge>
                <span className="text-xs text-muted-foreground">{[r.subject_name, r.grade ? `${r.grade}` : null, r.topic].filter(Boolean).join(" · ")}</span>
                {r.is_shared && <Badge tone="info">{d.questions.bankShared}</Badge>}
              </div>
              <RichText text={String(r.content.prompt ?? "")} className="line-clamp-3 text-sm" />
              <div className="mt-3 flex flex-wrap gap-1 border-t border-border pt-3">
                <Button size="sm" variant="soft" disabled={!target || pending} onClick={() => run(() => addBankItemsToAssessmentAction(target, [r.id]), d.questions.added)}><FolderInput /> {d.questions.addToAssessment}</Button>
                {r.is_own && <Button size="sm" variant="ghost" onClick={() => setEditing({ q: { ...r }, meta: { subjectId: r.subject_id, grade: r.grade, difficulty: r.difficulty, isShared: r.is_shared } })}><Pencil /> {d.common.edit}</Button>}
                <Button size="sm" variant="ghost" onClick={() => run(() => duplicateBankItemAction(r.id))}><Copy /> {d.common.duplicate}</Button>
                {r.is_own && <Button size="sm" variant="ghost" className="ml-auto text-danger" onClick={() => { if (window.confirm(d.questions.deleteConfirm)) run(() => deleteBankItemAction(r.id)); }}><Trash2 /> {d.common.delete}</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing.q.id ? d.common.edit : d.questions.bankNew} className="max-w-3xl">
            <QuestionEditor
              initial={editing.q}
              bankMeta={editing.meta}
              subjects={subjects}
              onCancel={() => setEditing(null)}
              onSave={async (input) => {
                const res = await saveBankItemAction({ ...input, subjectId: input.subjectId ?? null, grade: input.grade ?? null, difficulty: input.difficulty ?? "medium", isShared: input.isShared ?? false });
                if (res.ok) { setEditing(null); router.refresh(); }
                return res;
              }}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
