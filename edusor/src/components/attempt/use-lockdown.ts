"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LockdownEventType =
  | "fullscreen_exit" | "fullscreen_enter" | "visibility_hidden" | "visibility_visible" | "window_blur" | "window_focus"
  | "copy_blocked" | "paste_blocked" | "cut_blocked" | "context_menu_blocked" | "print_blocked" | "devtools_shortcut"
  | "connection_lost" | "connection_restored";

type QueuedEvent = { type: LockdownEventType; clientTime: string; durationMs?: number; metadata?: Record<string, string | number | boolean> };

/**
 * Browser-based Lockdown Mode. It cannot prevent switching apps, second devices or screenshots;
 * it records detectable events for teacher review and discourages copy/paste/print.
 * Connection events are recorded for every attempt (useful for monitoring), the rest only in lockdown.
 */
export function useLockdown(attemptId: string, enabled: boolean, active: boolean) {
  const queue = useRef<QueuedEvent[]>([]);
  const sending = useRef(false);
  const hiddenAt = useRef<number | null>(null);
  const blurAt = useRef<number | null>(null);
  const offlineAt = useRef<number | null>(null);
  const [warning, setWarning] = useState<"exit" | "hidden" | "copy" | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(true);
  // Detected after mount so server and client render the same markup.
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(!!document.fullscreenEnabled), []);

  const send = useCallback(async () => {
    if (sending.current || queue.current.length === 0 || !navigator.onLine) return;
    sending.current = true;
    const batch = queue.current.slice(0, 50);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
      if (res.ok) queue.current.splice(0, batch.length);
    } catch {
      // keep queued; retried on the next tick/online
    } finally {
      sending.current = false;
    }
  }, [attemptId]);

  const record = useCallback(
    (type: LockdownEventType, extra: Omit<QueuedEvent, "type" | "clientTime"> = {}) => {
      queue.current.push({ type, clientTime: new Date().toISOString(), ...extra });
      void send();
    },
    [send],
  );

  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => void send(), 5000);
    const onOffline = () => {
      offlineAt.current = Date.now();
      record("connection_lost");
    };
    const onOnline = () => {
      record("connection_restored", { durationMs: offlineAt.current ? Date.now() - offlineAt.current : undefined });
      offlineAt.current = null;
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    if (!enabled) {
      return () => {
        clearInterval(tick);
        window.removeEventListener("offline", onOffline);
        window.removeEventListener("online", onOnline);
      };
    }

    setIsFullscreen(!supported || !!document.fullscreenElement);
    const flash = (w: "exit" | "hidden" | "copy") => {
      setWarning(w);
      setTimeout(() => setWarning((cur) => (cur === w ? null : cur)), 6000);
    };
    const onFullscreen = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      record(fs ? "fullscreen_enter" : "fullscreen_exit");
      if (!fs) flash("exit");
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        record("visibility_hidden");
      } else {
        record("visibility_visible", { durationMs: hiddenAt.current ? Date.now() - hiddenAt.current : undefined });
        hiddenAt.current = null;
        flash("hidden");
      }
    };
    // A tab switch fires blur + visibilitychange; only report blur when the page stays visible.
    const onBlur = () => {
      setTimeout(() => {
        if (document.visibilityState === "visible" && !document.hasFocus()) {
          blurAt.current = Date.now();
          record("window_blur");
        }
      }, 250);
    };
    const onFocus = () => {
      if (blurAt.current) {
        record("window_focus", { durationMs: Date.now() - blurAt.current });
        blurAt.current = null;
        flash("hidden");
      }
    };
    const block = (type: LockdownEventType) => (e: Event) => {
      const target = e.target as HTMLElement | null;
      // Restricted everywhere in lockdown, including answer fields (pasting prepared text).
      e.preventDefault();
      record(type, target?.tagName ? { metadata: { target: target.tagName.toLowerCase() } } : {});
      flash("copy");
    };
    const onCopy = block("copy_blocked");
    const onCut = block("cut_blocked");
    const onPaste = block("paste_blocked");
    const onContext = block("context_menu_blocked");
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        record("print_blocked");
      } else if (e.key === "F12" || (mod && e.shiftKey && ["i", "j", "c"].includes(e.key.toLowerCase()))) {
        record("devtools_shortcut");
      }
    };
    const onBeforePrint = () => record("print_blocked");

    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("keydown", onKey);
    window.addEventListener("beforeprint", onBeforePrint);
    return () => {
      clearInterval(tick);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeprint", onBeforePrint);
    };
  }, [active, enabled, record, send, supported]);

  const enterFullscreen = useCallback(async () => {
    if (!supported) return;
    await document.documentElement.requestFullscreen().catch(() => undefined);
  }, [supported]);

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  }, []);

  return { warning, isFullscreen, supported, enterFullscreen, exitFullscreen, flushEvents: send };
}
