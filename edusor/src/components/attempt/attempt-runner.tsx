"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, CloudOff, Flag, Loader2, Maximize, Send, WifiOff } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { formatDuration } from "@/lib/i18n/format";
import { isEmptyResponse } from "@/lib/assessment/schema";
import { QuestionView, type UploadedFile, type ViewQuestion } from "@/components/questions/question-view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/misc";
import { cn, fmt, formatPoints } from "@/lib/utils";
import { useAutosave, type Entry } from "./use-autosave";
import { useLockdown } from "./use-lockdown";

export type RunnerQuestion = ViewQuestion & { sectionTitle: string | null };

type Props = {
  attemptId: string;
  title: string;
  questions: RunnerQuestion[];
  optionOrders: Record<string, string[]>;
  initialAnswers: Record<string, { response: Record<string, unknown>; seq: number; flagged: boolean }>;
  initialFiles: Record<string, UploadedFile[]>;
  deadlineAt: string | null;
  serverNow: string;
  allowNavigation: boolean;
  lockdown: boolean;
  initialQuestionId: string | null;
};

export function AttemptRunner(p: Props) {
  const { d } = useI18n();
  const router = useRouter();
  const [responses, setResponses] = useState<Record<string, Record<string, unknown>>>(() => Object.fromEntries(Object.entries(p.initialAnswers).map(([k, v]) => [k, v.response])));
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.entries(p.initialAnswers).map(([k, v]) => [k, v.flagged])));
  const [files, setFiles] = useState(p.initialFiles);
  const [index, setIndex] = useState(() => Math.max(0, p.questions.findIndex((q) => q.id === p.initialQuestionId)));
  const [submitOpen, setSubmitOpen] = useState(false);
  const [phase, setPhase] = useState<"running" | "submitting" | "done">("running");
  const [finishReason, setFinishReason] = useState<"manual" | "timeout" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const offset = useRef(new Date(p.serverNow).getTime() - Date.now());
  const [deadline, setDeadline] = useState(p.deadlineAt ? new Date(p.deadlineAt).getTime() : null);
  const [remaining, setRemaining] = useState<number | null>(deadline ? Math.max(0, (deadline - (Date.now() + offset.current)) / 1000) : null);
  const finishing = useRef(false);

  const serverSeq = useMemo(() => Object.fromEntries(Object.entries(p.initialAnswers).map(([k, v]) => [k, v.seq])), [p.initialAnswers]);

  const finish = useCallback(
    async (reason: "manual" | "timeout") => {
      if (finishing.current) return;
      finishing.current = true;
      setPhase("submitting");
      setFinishReason(reason);
      await autosaveRef.current?.flush();
      await lockdownRef.current?.flushEvents();
      for (let i = 0; i < 4; i++) {
        try {
          const res = await fetch(`/api/attempts/${p.attemptId}/submit`, { method: "POST" });
          if (res.ok) {
            autosaveRef.current?.clearLocal();
            await lockdownRef.current?.exitFullscreen();
            setPhase("done");
            router.refresh();
            return;
          }
          if (res.status === 403) break;
        } catch {
          // network: retry
        }
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      }
      finishing.current = false;
      setPhase("running");
      setSubmitError(d.errors.network);
    },
    [d.errors.network, p.attemptId, router],
  );

  const onLocked = useCallback((reason: string) => void finish(reason === "expired" ? "timeout" : "manual"), [finish]);
  const autosave = useAutosave(p.attemptId, serverSeq, onLocked);
  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;
  const lockdown = useLockdown(p.attemptId, p.lockdown, phase === "running");
  const lockdownRef = useRef(lockdown);
  lockdownRef.current = lockdown;

  // Restore unsent answers saved locally before a refresh/disconnect.
  useEffect(() => {
    const restored = autosave.restoreLocal();
    if (Object.keys(restored).length) {
      setResponses((r) => ({ ...r, ...Object.fromEntries(Object.entries(restored).map(([k, v]: [string, Entry]) => [k, v.response])) }));
      setFlags((f) => ({ ...f, ...Object.fromEntries(Object.entries(restored).map(([k, v]: [string, Entry]) => [k, v.flagged])) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Server-authoritative timer: local ticking, resynchronized with the server every 30 s.
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => {
      const left = (deadline - (Date.now() + offset.current)) / 1000;
      setRemaining(Math.max(0, left));
      if (left <= 0) void finish("timeout");
    }, 500);
    return () => clearInterval(t);
  }, [deadline, finish]);

  const current = p.questions[index];
  useEffect(() => {
    const beat = async () => {
      const sent = Date.now();
      try {
        const res = await fetch(`/api/attempts/${p.attemptId}/heartbeat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentQuestionId: current?.id ?? null }) });
        if (!res.ok) return;
        const json = (await res.json()) as { status: string; server_now: string; deadline_at: string | null };
        const rtt = Date.now() - sent;
        offset.current = new Date(json.server_now).getTime() + rtt / 2 - Date.now();
        setDeadline(json.deadline_at ? new Date(json.deadline_at).getTime() : null);
        if (json.status === "submitted" && !finishing.current) {
          finishing.current = true;
          setFinishReason("timeout");
          setPhase("done");
          router.refresh();
        }
      } catch {
        // offline; the autosave indicator already reflects it
      }
    };
    void beat();
    const t = setInterval(beat, 30000);
    return () => clearInterval(t);
  }, [p.attemptId, current?.id, router]);

  const isAnswered = useCallback(
    (q: RunnerQuestion) => (q.type === "file_upload" || q.type === "image_answer" ? (files[q.id]?.length ?? 0) > 0 : !isEmptyResponse(q.type, responses[q.id] ?? {})),
    [files, responses],
  );
  const answered = p.questions.filter(isAnswered).length;
  const unanswered = p.questions.map((q, i) => ({ q, i })).filter(({ q }) => !isAnswered(q));

  const change = (q: RunnerQuestion, r: Record<string, unknown>) => {
    setResponses((s) => ({ ...s, [q.id]: r }));
    autosave.queue(q.id, r, flags[q.id] ?? false);
  };
  const toggleFlag = (q: RunnerQuestion) => {
    const next = !flags[q.id];
    setFlags((f) => ({ ...f, [q.id]: next }));
    autosave.queue(q.id, responses[q.id] ?? {}, next);
  };
  const upload = async (q: RunnerQuestion, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("questionId", q.id);
    const res = await fetch(`/api/attempts/${p.attemptId}/files`, { method: "POST", body: fd });
    if (!res.ok) throw new Error("upload");
    const f = (await res.json()) as UploadedFile;
    const list = [...(files[q.id] ?? []), f];
    setFiles((s) => ({ ...s, [q.id]: list }));
    change(q, { fileIds: list.map((x) => x.id) });
  };
  const removeFile = async (q: RunnerQuestion, fileId: string) => {
    const res = await fetch(`/api/attempts/${p.attemptId}/files?fileId=${fileId}`, { method: "DELETE" });
    if (!res.ok) return;
    const list = (files[q.id] ?? []).filter((f) => f.id !== fileId);
    setFiles((s) => ({ ...s, [q.id]: list }));
    change(q, { fileIds: list.map((x) => x.id) });
  };

  if (phase === "done") {
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-lg border border-border bg-surface p-8 text-center shadow-card">
        <CheckCircle2 className="mx-auto mb-3 size-10 text-success" />
        <h1 className="text-lg font-semibold">{finishReason === "timeout" ? d.attempt.timeUpTitle : d.attempt.submittedTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{finishReason === "timeout" ? d.attempt.timeUpText : d.attempt.submittedTitle}</p>
        <Loader2 className="mx-auto mt-4 size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const timeLow = remaining !== null && remaining < 300;
  const saveLabel = autosave.status === "idle" ? "" : d.attempt.saveStatus[autosave.status];

  return (
    <div className={cn("flex min-h-dvh flex-col", p.lockdown && "no-select")} translate={p.lockdown ? "no" : undefined}>
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{p.title}</p>
            <p className="text-xs text-muted-foreground">{fmt(d.attempt.answered, { n: answered, total: p.questions.length })}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            {autosave.status === "saving" && <Loader2 className="size-3.5 animate-spin" />}
            {autosave.status === "saved" && <CheckCircle2 className="size-3.5 text-success" />}
            {autosave.status === "failed" && <CloudOff className="size-3.5 text-danger" />}
            {autosave.status === "offline" && <WifiOff className="size-3.5 text-danger" />}
            <span className={cn("hidden sm:inline", (autosave.status === "failed" || autosave.status === "offline") && "text-danger")}>{saveLabel}</span>
          </div>
          {remaining !== null && (
            <div className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-sm font-semibold tabular-nums", timeLow ? "bg-danger-soft text-danger" : "bg-muted")} role="timer" aria-label={d.attempt.timeLeft}>
              <Clock className="size-4" /> {formatDuration(remaining)}
            </div>
          )}
          <Button size="sm" onClick={() => setSubmitOpen(true)} disabled={phase !== "running"}><Send /> <span className="hidden sm:inline">{d.attempt.submit}</span></Button>
        </div>
        {(autosave.status === "offline" || autosave.status === "failed") && (
          <div className="bg-danger-soft px-4 py-1.5 text-center text-xs text-danger">{d.attempt.saveStatus.offline}</div>
        )}
        {lockdown.warning && (
          <div className="bg-warning-soft px-4 py-1.5 text-center text-xs text-warning" role="alert">
            {lockdown.warning === "exit" ? d.lockdown.warningExit : lockdown.warning === "hidden" ? d.lockdown.warningHidden : d.lockdown.blockedCopy}
          </div>
        )}
      </header>

      {p.lockdown && lockdown.supported && !lockdown.isFullscreen && phase === "running" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-md rounded-lg bg-surface p-6 text-center shadow-xl">
            <AlertTriangle className="mx-auto mb-3 size-8 text-warning" />
            <p className="text-sm">{d.lockdown.warningExit}</p>
            <Button className="mt-4" onClick={() => void lockdown.enterFullscreen()}><Maximize /> {d.lockdown.returnFullscreen}</Button>
          </div>
        </div>
      )}

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[1fr_260px]">
        <main className="min-w-0">
          {p.lockdown && !lockdown.supported && <Alert tone="info" className="mb-4">{d.lockdown.fullscreenUnsupported}</Alert>}
          {submitError && <Alert tone="danger" className="mb-4">{submitError}</Alert>}
          {current && (
            <article className="rounded-lg border border-border bg-surface p-5 shadow-card sm:p-7" aria-labelledby="q-heading">
              {current.sectionTitle && <p className="mb-1 text-xs font-medium uppercase tracking-wide text-primary">{current.sectionTitle}</p>}
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 id="q-heading" className="text-sm font-semibold text-muted-foreground">
                  {fmt(d.attempt.questionOf, { n: index + 1, total: p.questions.length })} · {formatPoints(current.points)} {d.common.pointsShort}
                </h2>
                <Button size="sm" variant={flags[current.id] ? "soft" : "ghost"} onClick={() => toggleFlag(current)} aria-pressed={!!flags[current.id]}>
                  <Flag className={cn(flags[current.id] && "fill-current")} /> {flags[current.id] ? d.attempt.flagged : d.attempt.flag}
                </Button>
              </div>
              <QuestionView
                key={current.id}
                question={current}
                response={responses[current.id] ?? {}}
                onChange={(r) => change(current, r)}
                optionOrder={p.optionOrders[current.id]}
                files={files[current.id]}
                onUpload={(f) => upload(current, f)}
                onRemoveFile={(id) => void removeFile(current, id)}
              />
            </article>
          )}
          <div className="mt-4 flex justify-between gap-3">
            <Button variant="secondary" disabled={index === 0 || !p.allowNavigation} onClick={() => setIndex((i) => i - 1)}><ChevronLeft /> {d.common.previous}</Button>
            {index < p.questions.length - 1 ? (
              <Button onClick={() => setIndex((i) => i + 1)}>{d.common.next} <ChevronRight /></Button>
            ) : (
              <Button onClick={() => setSubmitOpen(true)}><Send /> {d.attempt.submit}</Button>
            )}
          </div>
        </main>
        <aside className="order-first lg:order-none">
          <nav className="rounded-lg border border-border bg-surface p-4 shadow-card lg:sticky lg:top-20" aria-label={d.common.questions}>
            <p className="mb-3 text-xs font-medium text-muted-foreground">{d.common.questions}</p>
            <div className="grid grid-cols-8 gap-1.5 lg:grid-cols-5">
              {p.questions.map((q, i) => {
                const done = isAnswered(q);
                return (
                  <button
                    key={q.id}
                    type="button"
                    disabled={!p.allowNavigation && i !== index}
                    onClick={() => setIndex(i)}
                    aria-current={i === index ? "step" : undefined}
                    aria-label={`${i + 1}${done ? " ✓" : ""}${flags[q.id] ? " ⚑" : ""}`}
                    className={cn(
                      "relative flex h-9 items-center justify-center rounded-md border text-sm font-medium tabular-nums transition-colors disabled:cursor-not-allowed",
                      i === index ? "border-primary ring-2 ring-primary/30" : "border-border",
                      done ? "bg-primary text-primary-foreground" : "bg-surface hover:bg-muted",
                    )}
                  >
                    {i + 1}
                    {flags[q.id] && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-warning" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 space-y-1 text-xs text-muted-foreground">
              <p className="flex items-center gap-2"><span className="size-3 rounded bg-primary" /> {fmt(d.attempt.answered, { n: answered, total: p.questions.length })}</p>
              <p className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-warning" /> {d.attempt.flagged}</p>
            </div>
          </nav>
        </aside>
      </div>

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent
          title={d.attempt.submitTitle}
          footer={
            <>
              <DialogClose asChild><Button variant="secondary">{d.common.cancel}</Button></DialogClose>
              <Button loading={phase === "submitting"} onClick={() => { setSubmitOpen(false); void finish("manual"); }}>{d.attempt.submitConfirm}</Button>
            </>
          }
        >
          {unanswered.length === 0 ? (
            <p className="text-sm">{d.attempt.submitAll}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <Alert tone="warning">{fmt(d.attempt.submitUnanswered, { n: unanswered.length })}</Alert>
              {p.allowNavigation && (
                <div className="flex flex-wrap gap-1.5">
                  {unanswered.map(({ i }) => (
                    <Button key={i} size="sm" variant="secondary" onClick={() => { setIndex(i); setSubmitOpen(false); }}>{i + 1}</Button>
                  ))}
                </div>
              )}
            </div>
          )}
          {autosave.pendingCount > 0 && <p className="mt-3 text-xs text-muted-foreground">{d.attempt.saveStatus.saving}</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
