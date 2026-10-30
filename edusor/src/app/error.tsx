"use client";

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { d } = useI18n();
  useEffect(() => console.error(error), [error]);
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold">{d.errors.generic}</h1>
      {error.digest && <p className="text-xs text-muted-foreground">ID: {error.digest}</p>}
      <Button onClick={reset}>{d.common.retry}</Button>
    </div>
  );
}
