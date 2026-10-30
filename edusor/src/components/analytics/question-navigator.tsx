"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import type { QuestionAnalytics } from "@/lib/data/assessment-analytics";
import { summarizeQuestionAction } from "@/lib/actions/analytics";
import { RichText, InlineRich } from "@/components/content/rich-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn, fmt, formatPoints } from "@/lib/utils";

export function QuestionNavigator({ assessmentId, questions, aiReady }: { assessmentId: string; questions: QuestionAnalytics[]; aiReady: boolean }) {
  const { d } = useI18n();
  const te = useTranslateError();
  const [sel, setSel] = useState(0);
  const [summary, setSummary] = useState<Record<string, { summary: string; patterns: { pattern: string; count: number }[] } | string>>({});
  const [pending, start] = useTransition();
  const q = questions[sel];
  if (!q) return null;
  const s = q.stats;
  const optionLabel = (id: string, text: string) => (id === "true" ? d.questions.trueLabel : id === "false" ? d.questions.falseLabel : text);
  const open = ["essay", "file_upload", "image_answer", "short_text"].includes(q.type);
  const cur = summary[q.id];

  const facts: [string, string][] = [
    [d.questions.points, formatPoints(q.maxPoints)],
    [d.analytics.responses, String(s.responses)],
    [d.analytics.correct, String(s.correct)],
    [d.analytics.partial, String(s.partial)],
    [d.analytics.incorrect, String(s.incorrect)],
    [d.analytics.unanswered, String(s.unanswered)],
    [d.analytics.accuracy, s.accuracy === null ? "—" : `${s.accuracy}%`],
    [d.analytics.avgPoints, s.avgPoints === null ? "—" : formatPoints(s.avgPoints)],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <nav aria-label={d.analytics.questionNavigator} className="flex flex-wrap gap-1.5 lg:flex-col">
        {questions.map((x, i) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setSel(i)}
            aria-current={i === sel ? "true" : undefined}
            className={cn("flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm", i === sel ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-muted")}
          >
            <span className="font-medium">{x.index}. <span className="font-normal text-muted-foreground">{d.questions.types[x.type]}</span></span>
            <span className="flex items-center gap-1 tabular-nums text-xs">
              {x.stats.difficulty.flagged && <AlertTriangle className="size-3.5 text-warning" aria-label={d.analytics.difficult} />}
              {x.stats.accuracy === null ? "—" : `${x.stats.accuracy}%`}
            </span>
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-5">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone="primary">{d.questions.types[q.type]}</Badge>
            {q.topic && <Badge>{q.topic}</Badge>}
            {s.difficulty.flagged && <Badge tone="warning"><AlertTriangle className="size-3" /> {d.analytics.difficult}: {s.difficulty.reasons.map((r) => d.analytics.difficultReasons[r]).join(", ")}</Badge>}
          </div>
          <RichText text={q.prompt} className="text-sm" />
          {s.difficulty.smallSample && <p className="mt-3 text-xs text-muted-foreground">{fmt(d.analytics.smallSample, { n: s.responses })}</p>}
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k} className="rounded-md bg-muted/60 px-3 py-2"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-sm font-semibold tabular-nums">{v}</dd></div>
            ))}
          </dl>
        </div>

        {q.options && (
          <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
            <h3 className="mb-3 text-sm font-semibold">{d.analytics.optionDistribution}</h3>
            <ul className="flex flex-col gap-2.5">
              {q.options.map((o, i) => (
                <li key={o.id} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_88px] items-center gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{q.type === "true_false" ? "" : `${String.fromCharCode(65 + i)}.`}</span>
                    <InlineRich text={optionLabel(o.id, o.text)} className="truncate" />
                    {o.correct && <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-success"><CheckCircle2 className="size-3.5" /> {d.analytics.correctOption}</span>}
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${o.share * 100}%` }} /></span>
                  <span className="text-right tabular-nums text-muted-foreground">{o.count} · {Math.round(o.share * 100)}%</span>
                </li>
              ))}
            </ul>
            {q.mostCommonWrong && <p className="mt-3 text-xs text-muted-foreground">{d.analytics.mostCommonWrong}: <InlineRich text={optionLabel(q.mostCommonWrong.id, q.mostCommonWrong.text)} /> ({Math.round(q.mostCommonWrong.share * 100)}%)</p>}
          </div>
        )}

        {q.rubric.length > 0 && (
          <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
            <h3 className="mb-3 text-sm font-semibold">{d.analytics.rubricPerformance}</h3>
            <ul className="flex flex-col gap-2.5">
              {q.rubric.map((r) => (
                <li key={r.id} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_88px] items-center gap-3 text-sm">
                  <span className="truncate">{r.title}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${r.avg === null ? 0 : (r.avg / r.max) * 100}%` }} /></span>
                  <span className="text-right tabular-nums text-muted-foreground">{r.avg === null ? "—" : `${formatPoints(r.avg)} / ${formatPoints(r.max)}`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {q.patterns.length > 0 && (
          <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
            <h3 className="mb-3 text-sm font-semibold">{d.analytics.commonPatterns}</h3>
            <ul className="flex flex-col gap-1.5 text-sm">{q.patterns.map((p) => <li key={p.text} className="flex justify-between gap-3"><span className="truncate font-mono">{p.text}</span><span className="tabular-nums text-muted-foreground">{p.count}</span></li>)}</ul>
          </div>
        )}

        {open && (
          <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{d.analytics.aiSummary}</h3>
              {aiReady && <Button size="sm" variant="soft" loading={pending} onClick={() => start(async () => { const r = await summarizeQuestionAction(assessmentId, q.id); setSummary((m) => ({ ...m, [q.id]: r.ok ? r.data : r.error })); })}><Bot /> {d.analytics.aiSummaryGenerate}</Button>}
            </div>
            {!aiReady && <p className="text-sm text-muted-foreground">{d.errors.aiUnavailable}</p>}
            {typeof cur === "string" && <Alert tone="danger">{te(cur)}</Alert>}
            {cur && typeof cur !== "string" && (
              <div className="flex flex-col gap-2 text-sm">
                <p className="text-xs text-muted-foreground">{d.common.aiGenerated}</p>
                <RichText text={cur.summary} />
                <ul className="list-disc pl-5">{cur.patterns.map((p) => <li key={p.pattern}>{p.pattern} — {p.count}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-border bg-surface shadow-card">
          <Table>
            <THead><TR><TH>{d.common.student}</TH><TH>{d.analytics.answer}</TH><TH>{d.grading.score}</TH><TH /></TR></THead>
            <TBody>
              {q.responses.map((r) => (
                <TR key={r.attemptId}>
                  <TD className="whitespace-nowrap font-medium">{r.student}</TD>
                  <TD className="max-w-md truncate text-muted-foreground">{r.text ? <InlineRich text={r.text} /> : "—"}</TD>
                  <TD className="tabular-nums">{r.points === null ? "—" : `${formatPoints(r.points)} / ${formatPoints(q.maxPoints)}`}</TD>
                  <TD className="text-right"><Link className="text-xs text-primary hover:underline" href={`/teacher/submissions/${r.attemptId}/review`}>{d.analytics.openResponse}</Link></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
