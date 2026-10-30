"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "failed" | "offline";
export type Entry = { response: Record<string, unknown>; seq: number; flagged: boolean };

const storageKey = (attemptId: string) => `edusor:attempt:${attemptId}:pending`;

function readLocal(attemptId: string): Record<string, Entry> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(attemptId)) ?? "{}") as Record<string, Entry>;
  } catch {
    return {};
  }
}

/**
 * Server-backed autosave.
 * - Every change gets a strictly increasing sequence number; the server ignores older writes.
 * - Unsent changes are mirrored to localStorage so a refresh or crash never loses them.
 * - Requests are serialized; failures retry with backoff and resume when the browser is online.
 */
export function useAutosave(attemptId: string, serverSeq: Record<string, number>, onLocked: (reason: string) => void) {
  const pending = useRef<Map<string, Entry>>(new Map());
  const lastSeq = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(2000);
  const locked = useRef(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [pendingCount, setPendingCount] = useState(0);

  const persist = useCallback(() => {
    try {
      if (pending.current.size === 0) localStorage.removeItem(storageKey(attemptId));
      else localStorage.setItem(storageKey(attemptId), JSON.stringify(Object.fromEntries(pending.current)));
    } catch {
      // storage full/blocked: the server copy still applies
    }
    setPendingCount(pending.current.size);
  }, [attemptId]);

  const nextSeq = useCallback(() => {
    lastSeq.current = Math.max(lastSeq.current + 1, Date.now());
    return lastSeq.current;
  }, []);

  const sendOnce = useCallback(async () => {
    if (locked.current) return;
    while (pending.current.size > 0) {
      const [questionId, entry] = pending.current.entries().next().value as [string, Entry];
      setStatus("saving");
      let res: Response;
      try {
        res = await fetch(`/api/attempts/${attemptId}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId, response: entry.response, seq: entry.seq, flagged: entry.flagged }),
          keepalive: true,
        });
      } catch {
        setStatus(navigator.onLine ? "failed" : "offline");
        throw new Error("network");
      }
      if (!res.ok) {
        setStatus("failed");
        throw new Error(`http ${res.status}`);
      }
      const json = (await res.json()) as { ok: boolean; reason?: string };
      if (!json.ok) {
        locked.current = true;
        onLocked(json.reason ?? "locked");
        return;
      }
      // Only drop the entry if no newer change arrived while the request was in flight.
      if (pending.current.get(questionId)?.seq === entry.seq) pending.current.delete(questionId);
      persist();
    }
    retryDelay.current = 2000;
    setStatus("saved");
  }, [attemptId, onLocked, persist]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current.catch(() => undefined);
    if (pending.current.size === 0) return true;
    const p = sendOnce();
    inFlight.current = p;
    try {
      await p;
      return pending.current.size === 0;
    } catch {
      const delay = retryDelay.current;
      retryDelay.current = Math.min(30000, delay * 2);
      timer.current = setTimeout(() => void flush(), delay);
      return false;
    } finally {
      inFlight.current = null;
    }
  }, [sendOnce]);

  const queue = useCallback(
    (questionId: string, response: Record<string, unknown>, flagged: boolean) => {
      pending.current.set(questionId, { response, flagged, seq: nextSeq() });
      persist();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 700);
    },
    [flush, nextSeq, persist],
  );

  // Restore unsent local changes newer than what the server has (e.g. after a refresh while offline).
  const restoreLocal = useCallback((): Record<string, Entry> => {
    const local = readLocal(attemptId);
    const restored: Record<string, Entry> = {};
    for (const [qid, entry] of Object.entries(local)) {
      if (entry.seq > (serverSeq[qid] ?? 0)) {
        pending.current.set(qid, entry);
        restored[qid] = entry;
        lastSeq.current = Math.max(lastSeq.current, entry.seq);
      }
    }
    persist();
    if (pending.current.size) void flush();
    return restored;
  }, [attemptId, flush, persist, serverSeq]);

  useEffect(() => {
    lastSeq.current = Math.max(lastSeq.current, ...Object.values(serverSeq), 0);
    const online = () => void flush();
    window.addEventListener("online", online);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current.size > 0 && !locked.current) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", beforeUnload);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush, serverSeq]);

  const clearLocal = useCallback(() => {
    pending.current.clear();
    persist();
  }, [persist]);

  return { queue, flush, status, pendingCount, restoreLocal, clearLocal };
}
