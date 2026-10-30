"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { loginSchema } from "@/lib/validation/auth";
import { loginAction } from "@/lib/actions/auth-forms";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const { d } = useI18n();
  const te = useTranslateError();
  const [serverError, setServerError] = useState<string | null>(linkError ? "generic" : null);
  const [pending, start] = useTransition();
  const form = useForm<z.input<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { identifier: "", password: "", next } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    start(async () => {
      const res = await loginAction(values);
      if (res && !res.ok) setServerError(res.error);
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {serverError && <Alert tone="danger">{te(serverError)}</Alert>}
      <Field label={d.auth.identifier} htmlFor="identifier" error={te(errors.identifier?.message)} hint={d.auth.studentLoginHint}>
        <Input id="identifier" autoComplete="username" autoCapitalize="none" aria-invalid={!!errors.identifier} {...form.register("identifier")} />
      </Field>
      <Field label={d.auth.password} htmlFor="password" error={te(errors.password?.message)}>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-[13px] text-primary hover:underline">{d.auth.forgot}</Link>
      </div>
      <Button type="submit" size="lg" loading={pending}>{d.auth.login}</Button>
    </form>
  );
}
