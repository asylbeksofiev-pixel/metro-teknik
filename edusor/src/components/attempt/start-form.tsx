"use client";

import { useState, useTransition } from "react";
import { startAttemptAction } from "@/lib/actions/attempts";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";

export function StartAttemptForm({ assessmentId, label, lockdown }: { assessmentId: string; label: string; lockdown: boolean }) {
  const { d } = useI18n();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      {error && <Alert tone="danger">{(d.attempt.errors as Record<string, string>)[error] ?? d.errors.generic}</Alert>}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4" checked={ready} onChange={(e) => setReady(e.target.checked)} />
        {d.attempt.ready}
      </label>
      <div>
        <Button
          size="lg"
          disabled={!ready}
          loading={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              // Enter fullscreen within the click gesture (browsers require a user activation).
              if (lockdown && document.fullscreenEnabled && !document.fullscreenElement) {
                await document.documentElement.requestFullscreen().catch(() => undefined);
              }
              const res = await startAttemptAction(assessmentId);
              if (res && !res.ok) setError(res.error);
            })
          }
        >
          {pending ? d.attempt.starting : label}
        </Button>
      </div>
    </div>
  );
}
