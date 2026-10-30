"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bot, Check, FileText, History, Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import { formatDateTime } from "@/lib/i18n/format";
import type { QuestionType, Rubric } from "@/lib/assessment/schema";
import { requestAiSuggestionAction, setQuestionScoreAction } from "@/lib/actions/grading";
import { QuestionView } from "@/components/questions/question-view";
import { RichText } from "@/components/content/rich-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { cn, fmt, formatPoints } from "@/lib/utils";

export type ReviewSuggestion = {
  id: string;
  score: number;
  explanation: string;
  feedback: string;
  confidence: number;
  needsReview: boolean;
  createdAt: string;
  criteria: { criterionId: string; title: string; score: number; max: number; comment: string | null }[];
};

export type ReviewItem = {
  answerId: string;
  index: number;
  type: QuestionType;
  content: Record<string, unknown>;
  response: Record<string, unknown>;
  maxPoints: number;
  autoPoints: number | null;
  autoResult: string;
  finalPoints: number | null;
  teacherFeedback: string | null;
  correctAnswer: string | null;
  explanation: string | null;
  rubric: Rubric | null;
  files: { name: string; url: string | null }[];
  transcription: string | null;
  suggestion: ReviewSuggestion | null;
  job: { status: string; error: string | null } | null;
  history: { source: "auto" | "ai_accepted" | "ai_edited" | "manual"; points: number; previous: number | null; at: string; reviewer: string | null }[];
};

export function QuestionReviewCard({ item, aiReady }: { item: ReviewItem; aiReady: boolean }) {
  const { d, locale } = useI18n();
  const te = useTranslateError();
  const router = useRouter();
  const [points, setPoints] = useState(item.finalPoints ?? item.suggestion?.score ?? item.autoPoints ?? null);
  const [feedback, setFeedback] = useState(item.teacherFeedback ?? "");
  const [criteria, setCriteria] = useState<Record<string, number>>(() => Object.fromEntries((item.suggestion?.criteria ?? []).map((c) => [c.criterionId, c.score])));
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pending, start] = useTransition();
  const rubric = item.rubric?.criteria ?? [];
  const decided = item.finalPoints !== null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "generic");
      else router.refresh();
    });

  const save = (source: "manual" | "ai_edited" | "ai_accepted", value: number, fb: string, crit?: Record<string, number>) =>
    run(() =>
      setQuestionScoreAction({
        answerId: item.answerId,
        points: value,
        feedback: fb,
        source,
        suggestionId: item.suggestion?.id,
        criterionScores: crit ? Object.entries(crit).map(([criterionId, score]) => ({ criterionId, score })) : undefined,
      }),
    );

  const setCriterion = (id: string, value: number) => {
    const next = { ...criteria, [id]: value };
    setCriteria(next);
    setPoints(Math.round(rubric.reduce((s, c) => s + (next[c.id] ?? 0), 0) * 100) / 100);
  };

  const resultTone = { correct: "success", incorrect: "danger", partial: "warning", unanswered: "neutral", pending: "info" } as const;
  const shownResult = decided ? (item.finalPoints! >= item.maxPoints ? "correct" : item.finalPoints! <= 0 ? "incorrect" : "partial") : item.autoResult;

  return (
    <article className={cn("rounded-lg border bg-surface shadow-card", decided ? "border-border" : "border-warning/50")}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <span className="flex size-6 items-center justify-center rounded bg-muted text-xs font-semibold">{item.index}</span>
        <Badge tone="primary">{d.questions.types[item.type]}</Badge>
        <Badge tone={resultTone[shownResult as keyof typeof resultTone] ?? "neutral"}>{(d.grading.results as Record<string, string>)[shownResult]}</Badge>
        <span className="ml-auto text-sm font-semibold tabular-nums">
          {decided ? formatPoints(item.finalPoints) : "—"} / {formatPoints(item.maxPoints)} {d.common.pointsShort}
        </span>
      </header>
      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <QuestionView question={{ id: item.answerId, type: item.type, content: item.content, points: item.maxPoints }} response={item.response} onChange={() => {}} disabled files={item.files.map((f, i) => ({ id: String(i), name: f.name }))} />
          {item.files.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">{d.grading.files}</p>
              {item.files.map((f, i) => (
                <a key={i} href={f.url ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline"><FileText className="size-4" /> {f.name}</a>
              ))}
            </div>
          )}
          {item.transcription && (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">{d.grading.ocrTranscription}</p>
              <RichText text={item.transcription} className="text-sm" />
            </div>
          )}
          {item.correctAnswer && (
            <div className="rounded-md border border-success/30 bg-success-soft/50 p-3">
              <p className="mb-1 text-xs font-medium text-success">{SUBJECTIVE.includes(item.type) ? d.grading.referenceAnswer : d.questions.correctAnswer}</p>
              <RichText text={item.correctAnswer} className="text-sm" />
            </div>
          )}
          {item.explanation && <div className="text-xs text-muted-foreground"><span className="font-medium">{d.questions.explanation}:</span> <RichText text={item.explanation} className="inline" /></div>}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {rubric.length > 0 && (
            <div className="rounded-md border border-border p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{d.grading.rubric}</p>
              <ul className="flex flex-col gap-2">
                {rubric.map((c) => {
                  const ai = item.suggestion?.criteria.find((x) => x.criterionId === c.id);
                  return (
                    <li key={c.id} className="grid grid-cols-[1fr_72px] items-start gap-2 text-sm">
                      <div>
                        <p className="font-medium">{c.title} <span className="text-xs text-muted-foreground">(0–{formatPoints(c.maxPoints)})</span></p>
                        {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                        {ai?.comment && <p className="mt-0.5 text-xs text-info">{d.grading.aiShort}: {ai.comment}</p>}
                      </div>
                      <Input aria-label={c.title} inputMode="decimal" className="h-8" value={criteria[c.id] ?? ""} onChange={(e) => setCriterion(c.id, Math.min(c.maxPoints, Math.max(0, Number(e.target.value.replace(",", ".")) || 0)))} />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {item.suggestion ? (
            <div className="rounded-md border border-info/30 bg-info-soft/50 p-3 text-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Bot className="size-4 text-info" />
                <span className="font-medium">{d.grading.aiSuggestion}: {formatPoints(item.suggestion.score)} / {formatPoints(item.maxPoints)}</span>
                <Badge tone={item.suggestion.confidence >= 0.7 ? "info" : "warning"}>{fmt(d.grading.aiConfidence, { n: Math.round(item.suggestion.confidence * 100) })}</Badge>
              </div>
              {item.suggestion.needsReview && <p className="mb-2 flex items-center gap-1.5 text-xs text-warning"><AlertTriangle className="size-3.5" /> {d.grading.aiLowConfidence}</p>}
              <p className="text-[13px]">{item.suggestion.explanation}</p>
              <p className="mt-2 text-[13px] text-muted-foreground">{d.grading.aiFeedbackForStudent}: {item.suggestion.feedback}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(item.suggestion.createdAt, locale)}</p>
            </div>
          ) : item.job && (item.job.status === "queued" || item.job.status === "running") ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {d.grading.aiPending}</p>
          ) : item.job?.status === "failed" ? (
            <Alert tone="danger">{fmt(d.grading.aiFailed, { error: item.job.error ?? "" })}</Alert>
          ) : null}
          {!aiReady && SUBJECTIVE_OR_SHORT.includes(item.type) && !item.suggestion && <p className="text-xs text-muted-foreground">{d.grading.aiUnavailable}</p>}

          <div className="grid grid-cols-[120px_1fr] items-end gap-3">
            <Field label={d.grading.setPoints} htmlFor={`p-${item.answerId}`}>
              <Input id={`p-${item.answerId}`} inputMode="decimal" value={points ?? ""} onChange={(e) => setPoints(e.target.value === "" ? null : Math.min(item.maxPoints, Math.max(0, Number(e.target.value.replace(",", ".")) || 0)))} />
            </Field>
            <span className="pb-2 text-sm text-muted-foreground">/ {formatPoints(item.maxPoints)}</span>
          </div>
          <Field label={d.grading.teacherFeedback} htmlFor={`f-${item.answerId}`}>
            <Textarea id={`f-${item.answerId}`} rows={2} maxLength={5000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          </Field>
          {error && <Alert tone="danger">{error === "aiUnavailable" ? d.grading.aiUnavailable : te(error)}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={pending} disabled={points === null} onClick={() => save(item.suggestion && points !== item.suggestion.score ? "ai_edited" : "manual", points!, feedback, rubric.length ? criteria : undefined)}>
              <Check /> {d.grading.saveScore}
            </Button>
            {item.suggestion && (
              <Button size="sm" variant="soft" disabled={pending} onClick={() => save("ai_accepted", item.suggestion!.score, feedback || item.suggestion!.feedback, Object.fromEntries(item.suggestion!.criteria.map((c) => [c.criterionId, c.score])))}>
                <Bot /> {d.grading.acceptAi}
              </Button>
            )}
            {aiReady && SUBJECTIVE_OR_SHORT.includes(item.type) && (
              <Button size="sm" variant="ghost" disabled={pending || item.job?.status === "queued" || item.job?.status === "running"} onClick={() => run(() => requestAiSuggestionAction(item.answerId))}>
                <RefreshCw /> {item.suggestion ? d.grading.requestAgain : d.grading.requestAi}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setShowHistory((s) => !s)}><History /> {d.grading.history}</Button>
          </div>
          {showHistory && (
            item.history.length === 0 ? <p className="text-xs text-muted-foreground">{d.grading.noHistory}</p> : (
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {item.history.map((h, i) => (
                  <li key={i}>{formatDateTime(h.at, locale)} · {h.reviewer ?? "—"} · {d.grading.sources[h.source]}: {h.previous === null ? "—" : formatPoints(h.previous)} → <b className="text-foreground">{formatPoints(h.points)}</b></li>
                ))}
              </ul>
            )
          )}
        </div>
      </div>
    </article>
  );
}

const SUBJECTIVE: QuestionType[] = ["essay", "file_upload", "image_answer"];
const SUBJECTIVE_OR_SHORT: QuestionType[] = [...SUBJECTIVE, "short_text"];
