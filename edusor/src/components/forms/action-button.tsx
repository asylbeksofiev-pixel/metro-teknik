"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import type { ActionResult } from "@/lib/actions/result";

type Props = {
  action: () => Promise<ActionResult<unknown>>;
  children: ReactNode;
  confirm?: { title: string; description?: string; confirmLabel?: string };
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  disabled?: boolean;
  errorMap?: Record<string, string>;
};

/** Runs a server action, refreshes the route on success and surfaces failures. Optional confirmation dialog. */
export function ActionButton({ action, children, confirm, variant = "secondary", size = "sm", className, disabled, errorMap }: Props) {
  const { d } = useI18n();
  const te = useTranslateError();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const run = () =>
    start(async () => {
      setError(null);
      const res = await action();
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(errorMap?.[res.error] ?? te(res.error));
    });

  if (!confirm) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <Button type="button" variant={variant} size={size} className={className} loading={pending} disabled={disabled} onClick={run}>{children}</Button>
        {error && <span role="alert" className="text-xs text-danger">{error}</span>}
      </span>
    );
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild>
        <Button type="button" variant={variant} size={size} className={className} disabled={disabled}>{children}</Button>
      </DialogTrigger>
      <DialogContent
        title={confirm.title}
        description={confirm.description}
        footer={
          <>
            <DialogClose asChild><Button variant="secondary">{d.common.cancel}</Button></DialogClose>
            <Button variant={variant === "danger" ? "danger" : "primary"} loading={pending} onClick={run}>{confirm.confirmLabel ?? d.common.confirm}</Button>
          </>
        }
      >
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
