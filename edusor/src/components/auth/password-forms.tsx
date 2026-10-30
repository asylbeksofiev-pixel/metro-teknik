"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { forgotSchema, resetSchema } from "@/lib/validation/auth";
import { forgotPasswordAction, resetPasswordAction } from "@/lib/actions/auth-forms";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";

export function ForgotForm() {
  const { d } = useI18n();
  const te = useTranslateError();
  const [state, setState] = useState<"idle" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const form = useForm<z.input<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await forgotPasswordAction(values);
      if (res.ok) setState("sent");
      else setErr(res.error);
    }),
  );

  if (state === "sent") return <Alert tone="success">{d.auth.linkSent}</Alert>;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {err && <Alert tone="danger">{te(err)}</Alert>}
      <Field label={d.common.email} htmlFor="email" error={te(form.formState.errors.email?.message)}>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Button type="submit" size="lg" loading={pending}>{d.auth.sendLink}</Button>
    </form>
  );
}

export function ResetForm() {
  const { d } = useI18n();
  const te = useTranslateError();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const form = useForm<z.input<typeof resetSchema>>({ resolver: zodResolver(resetSchema), defaultValues: { password: "", passwordRepeat: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await resetPasswordAction(values);
      if (res.ok) setDone(true);
      else if (res.fieldErrors) for (const [k, v] of Object.entries(res.fieldErrors)) form.setError(k as keyof typeof values, { message: v });
      else setErr(res.error);
    }),
  );

  if (done)
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{d.auth.resetDone}</Alert>
        <Button asChild><Link href="/app">{d.errors.toHome}</Link></Button>
      </div>
    );
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {err && <Alert tone="danger">{te(err)}</Alert>}
      <Field label={d.auth.newPassword} htmlFor="password" error={te(errors.password?.message)}>
        <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field label={d.auth.passwordRepeat} htmlFor="passwordRepeat" error={te(errors.passwordRepeat?.message)}>
        <Input id="passwordRepeat" type="password" autoComplete="new-password" {...form.register("passwordRepeat")} />
      </Field>
      <Button type="submit" size="lg" loading={pending}>{d.common.save}</Button>
    </form>
  );
}
