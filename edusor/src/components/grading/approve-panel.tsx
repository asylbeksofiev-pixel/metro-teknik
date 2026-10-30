"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Send } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import { approveAttemptAction, releaseResultsAction } from "@/lib/actions/grading";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { fmt, formatPoints } from "@/lib/utils";

export function ApprovePanel(p: { attemptId: string; assessmentId: string; openCount: number; total: number; max: number; approved: boolean; released: boolean; feedback: string | null }) {
  const { d } = useI18n();
  const te = useTranslateError();
  const router = useRouter();
  const [feedback, setFeedback] = useState(p.feedback ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "generic");
      else router.refresh();
    });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">{d.grading.finalScore}</span>
        <span className="text-2xl font-semibold tabular-nums">{formatPoints(p.total)} / {formatPoints(p.max)}</span>
      </div>
      {p.openCount > 0 ? <Badge tone="warning">{fmt(d.grading.needsReviewCount, { n: p.openCount })}</Badge> : <Badge tone="success">{d.grading.allChecked}</Badge>}
      <Field label={d.grading.overallFeedback} htmlFor="overall-feedback">
        <Textarea id="overall-feedback" rows={3} maxLength={5000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </Field>
      {error && <Alert tone="danger">{te(error)}</Alert>}
      <Button loading={pending} disabled={p.openCount > 0} onClick={() => run(() => approveAttemptAction(p.attemptId, feedback))}>
        <CheckCircle2 /> {p.approved ? `${d.grading.approved} · ${d.common.save}` : d.grading.approve}
      </Button>
      {p.openCount > 0 && <p className="text-xs text-muted-foreground">{d.grading.cannotApprove}</p>}
      {p.approved && !p.released && (
        <Button variant="secondary" loading={pending} onClick={() => run(() => releaseResultsAction(p.assessmentId, [p.attemptId]))}><Send /> {d.grading.release}</Button>
      )}
      {p.released && <Badge tone="success">{d.grading.released}</Badge>}
    </div>
  );
}
