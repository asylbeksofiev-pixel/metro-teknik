"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Radio, RefreshCw, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime, formatDuration } from "@/lib/i18n/format";
import { attemptDetailAction, forceSubmitAction, liveDataAction, type AttemptDetail, type LiveData, type LiveRow } from "@/lib/actions/live";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ProgressBar, StatCard, Alert } from "@/components/ui/misc";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn, fmt } from "@/lib/utils";

type Conn = "online" | "idle" | "offline";

function connection(row: LiveRow, now: number): Conn | null {
  if (row.status !== "in_progress" || !row.lastSeenAt) return null;
  const age = (now - new Date(row.lastSeenAt).getTime()) / 1000;
  return age < 75 ? "online" : age < 180 ? "idle" : "offline";
}

export function LiveMonitor({ assessmentId, initial }: { assessmentId: string; initial: LiveData }) {
  const { d, locale } = useI18n();
  const [data, setData] = useState(initial);
  const [mode, setMode] = useState<"realtime" | "polling">("polling");
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(new Date(initial.serverNow).getTime() - Date.now());
  const [selected, setSelected] = useState<LiveRow | null>(null);
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forcing, setForcing] = useState(false);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const res = await liveDataAction(assessmentId);
      if (res.ok) {
        offset.current = new Date(res.data.serverNow).getTime() - Date.now();
        setData(res.data);
        setError(null);
      } else setError(res.error);
    } catch {
      setError("network");
    } finally {
      refreshing.current = false;
    }
  }, [assessmentId]);

  // Realtime (RLS-filtered postgres_changes) with a polling fallback.
  useEffect(() => {
    const supabase = createClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), 400);
    };
    const channel = supabase
      .channel(`live:${assessmentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attempts", filter: `assessment_id=eq.${assessmentId}` }, bump)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lockdown_events", filter: `assessment_id=eq.${assessmentId}` }, bump)
      .subscribe((status) => setMode(status === "SUBSCRIBED" ? "realtime" : "polling"));
    return () => {
      if (debounce) clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [assessmentId, refresh]);

  useEffect(() => {
    // Polling: every 10 s without realtime; a slow 30 s safety net with it (heartbeats don't emit row changes for idle students).
    const t = setInterval(() => void refresh(), mode === "realtime" ? 30000 : 10000);
    return () => clearInterval(t);
  }, [mode, refresh]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selected?.attemptId) return setDetail(null);
    void attemptDetailAction(selected.attemptId).then((r) => setDetail(r.ok ? r.data : null));
  }, [selected?.attemptId, data]);

  const rows = data.rows;
  const counts = {
    assigned: rows.length,
    notStarted: rows.filter((r) => r.status === "not_started").length,
    inProgress: rows.filter((r) => r.status === "in_progress").length,
    submitted: rows.filter((r) => r.status === "submitted").length,
    expired: rows.filter((r) => r.status === "expired").length,
    issues: rows.filter((r) => connection(r, now) === "offline").length,
  };
  const statusTone = { not_started: "neutral", in_progress: "warning", submitted: "success", expired: "danger" } as const;
  const statusLabel = { not_started: d.status.not_started, in_progress: d.status.in_progress, submitted: d.status.submitted, expired: d.live.expired };
  const ago = (iso: string | null) => {
    if (!iso) return "—";
    const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
    return s < 60 ? fmt(d.live.secondsAgo, { n: s }) : fmt(d.live.minutesAgo, { n: Math.floor(s / 60) });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1", mode === "realtime" ? "bg-success-soft text-success" : "bg-muted")}>
          <Radio className="size-3.5" /> {mode === "realtime" ? d.live.realtime : d.live.polling}
        </span>
        <Button size="sm" variant="ghost" onClick={() => void refresh()}><RefreshCw /> {d.common.retry}</Button>
      </div>
      {error && <Alert tone="danger">{error === "network" ? d.errors.network : d.errors.generic}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label={d.live.assigned} value={counts.assigned} icon={Users} />
        <StatCard label={d.live.notStarted} value={counts.notStarted} tone="info" />
        <StatCard label={d.live.inProgress} value={counts.inProgress} icon={Activity} tone="warning" />
        <StatCard label={d.live.submitted} value={counts.submitted} tone="success" />
        <StatCard label={d.live.expired} value={counts.expired} tone="danger" />
        <StatCard label={d.live.connectionIssues} value={counts.issues} tone="danger" />
      </div>
      <div className="rounded-lg border border-border bg-surface shadow-card">
        <Table>
          <THead>
            <TR><TH>{d.common.student}</TH><TH>{d.common.status}</TH><TH>{d.live.progress}</TH><TH>{d.live.currentQuestion}</TH><TH>{d.live.timeLeft}</TH><TH>{d.live.lastActivity}</TH><TH>{d.live.connection}</TH><TH>{d.live.events}</TH></TR>
          </THead>
          <TBody>
            {rows.map((r) => {
              const conn = connection(r, now);
              const left = r.status === "in_progress" && r.deadlineAt ? Math.max(0, (new Date(r.deadlineAt).getTime() - now) / 1000) : null;
              return (
                <TR key={r.studentId} className={cn(r.attemptId && "cursor-pointer")} onClick={() => r.attemptId && setSelected(r)}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD><Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge></TD>
                  <TD className="min-w-32">
                    {r.total > 0 ? (
                      <div className="flex items-center gap-2">
                        <ProgressBar value={r.answered} max={r.total} />
                        <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{r.answered}/{r.total}</span>
                      </div>
                    ) : "—"}
                  </TD>
                  <TD className="tabular-nums">{r.status === "in_progress" && r.currentIndex !== null && r.currentIndex >= 0 ? r.currentIndex + 1 : "—"}</TD>
                  <TD className={cn("font-mono tabular-nums", left !== null && left < 300 && "text-danger")}>{left !== null ? formatDuration(left) : "—"}</TD>
                  <TD className="text-xs text-muted-foreground">{r.status === "in_progress" ? ago(r.lastSeenAt) : formatDateTime(r.submittedAt, locale)}</TD>
                  <TD>
                    {conn ? (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className={cn("size-2 rounded-full", conn === "online" ? "bg-success" : conn === "idle" ? "bg-warning" : "bg-danger")} />
                        {d.live[conn]}
                      </span>
                    ) : "—"}
                  </TD>
                  <TD>{r.events > 0 ? <Badge tone="warning">{r.events}</Badge> : <span className="text-muted-foreground">0</span>}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{d.lockdown.eventsNote}</p>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && (
          <DialogContent title={`${d.live.studentDetail}: ${selected.name}`} className="max-w-2xl">
            <div className="flex flex-col gap-4 text-sm">
              <dl className="grid grid-cols-2 gap-3">
                <div><dt className="text-xs text-muted-foreground">{d.common.status}</dt><dd><Badge tone={statusTone[selected.status]}>{statusLabel[selected.status]}</Badge></dd></div>
                <div><dt className="text-xs text-muted-foreground">{d.live.progress}</dt><dd>{selected.answered}/{selected.total}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{d.live.startedAt}</dt><dd>{formatDateTime(selected.startedAt, locale)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{d.live.submittedAt}</dt><dd>{formatDateTime(selected.submittedAt, locale)}</dd></div>
                <div className="col-span-2"><dt className="text-xs text-muted-foreground">{d.live.unanswered}</dt><dd>{detail ? (detail.unanswered.length ? detail.unanswered.join(", ") : "—") : "…"}</dd></div>
              </dl>
              <div>
                <h3 className="mb-2 text-[13px] font-semibold">{d.lockdown.eventLog}</h3>
                {!detail ? <p className="text-muted-foreground">{d.common.loading}</p> : detail.events.length === 0 ? <p className="text-muted-foreground">{d.lockdown.noEvents}</p> : (
                  <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
                    {detail.events.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span>{(d.lockdown.events as Record<string, string>)[e.type] ?? e.type}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {e.durationMs !== null && `${d.lockdown.duration}: ${formatDuration(e.durationMs / 1000)} · `}
                          {new Date(e.occurredAt).toLocaleTimeString(locale === "kk" ? "kk-KZ" : "ru-RU", { timeZone: "Asia/Almaty" })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-muted-foreground">{d.lockdown.eventsNote}</p>
              </div>
              {selected.status === "in_progress" && selected.attemptId && (
                <div className="border-t border-border pt-3">
                  <Button
                    variant="danger"
                    loading={forcing}
                    onClick={async () => {
                      if (!window.confirm(d.live.forceSubmitConfirm)) return;
                      setForcing(true);
                      const res = await forceSubmitAction(selected.attemptId!);
                      setForcing(false);
                      if (res.ok) { setSelected(null); void refresh(); } else setError(res.error);
                    }}
                  >
                    {d.live.forceSubmit}
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
