"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { registerSchema } from "@/lib/validation/auth";
import { registerAction } from "@/lib/actions/auth-forms";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";

export function RegisterForm({ invite }: { invite?: string }) {
  const { d, locale } = useI18n();
  const te = useTranslateError();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const form = useForm<z.input<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", password: "", passwordRepeat: "", invite },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    start(async () => {
      const res = await registerAction(values, locale);
      if (!res) return;
      if (!res.ok) {
        if (res.fieldErrors) for (const [k, v] of Object.entries(res.fieldErrors)) form.setError(k as keyof typeof values, { message: v });
        else setServerError(res.error);
      } else setDone(true);
    });
  });

  if (done) return <Alert tone="success">{d.auth.checkEmail}</Alert>;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {invite && <Alert tone="info">{d.auth.inviteBanner}</Alert>}
      {serverError && <Alert tone="danger">{te(serverError)}</Alert>}
      <Field label={d.common.fullName} htmlFor="fullName" error={te(errors.fullName?.message)}>
        <Input id="fullName" autoComplete="name" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
      </Field>
      <Field label={d.common.email} htmlFor="email" error={te(errors.email?.message)}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
      </Field>
      <Field label={d.auth.password} htmlFor="password" error={te(errors.password?.message)}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
      </Field>
      <Field label={d.auth.passwordRepeat} htmlFor="passwordRepeat" error={te(errors.passwordRepeat?.message)}>
        <Input id="passwordRepeat" type="password" autoComplete="new-password" aria-invalid={!!errors.passwordRepeat} {...form.register("passwordRepeat")} />
      </Field>
      <p className="text-xs text-muted-foreground">
        {d.auth.acceptTerms} <Link href="/terms" className="underline">{d.legal.termsTitle}</Link> · <Link href="/privacy" className="underline">{d.legal.privacyTitle}</Link>
      </p>
      <Button type="submit" size="lg" loading={pending}>{d.auth.register}</Button>
    </form>
  );
}
