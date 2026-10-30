"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { useTranslateError } from "@/lib/i18n/use-tv";
import type { ActionResult } from "@/lib/actions/result";
import { cn } from "@/lib/utils";

export type SimpleField = {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "date" | "textarea" | "select" | "password" | "datetime-local";
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: string;
  hint?: string;
  min?: number;
  max?: number;
  maxLength?: number;
};

/**
 * Generic form for small admin/teacher forms. Client-side checks (required/type/length) give
 * immediate feedback; the server action validates again with zod and returns field errors.
 */
export function SimpleForm({
  fields,
  action,
  submitLabel,
  successMessage,
  resetOnSuccess = true,
  columns = 1,
}: {
  fields: SimpleField[];
  action: (values: Record<string, string>) => Promise<ActionResult<unknown>>;
  submitLabel: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
  columns?: 1 | 2 | 3;
}) {
  const te = useTranslateError();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ error?: string; success?: boolean }>({});
  const defaults = Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? ""]));
  const form = useForm<Record<string, string>>({ defaultValues: defaults });

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setStatus({});
      const res = await action(values);
      if (res.ok) {
        setStatus({ success: true });
        if (resetOnSuccess) form.reset(defaults);
        router.refresh();
      } else if (res.fieldErrors) {
        for (const [k, v] of Object.entries(res.fieldErrors)) form.setError(k, { message: v });
      } else setStatus({ error: res.error });
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      {status.error && <Alert tone="danger">{te(status.error)}</Alert>}
      {status.success && successMessage && <Alert tone="success">{successMessage}</Alert>}
      <div className={cn("grid gap-3", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}>
        {fields.map((f) => {
          const err = form.formState.errors[f.name]?.message;
          const reg = form.register(f.name, {
            required: f.required ? "required" : false,
            maxLength: f.maxLength ? { value: f.maxLength, message: "tooLong" } : undefined,
            validate: f.type === "number" ? (v) => v === "" || !Number.isNaN(Number(v)) || "number" : undefined,
          });
          const common = { id: `f-${f.name}`, "aria-invalid": !!err };
          return (
            <Field key={f.name} label={f.label} htmlFor={common.id} hint={f.hint} error={te(err)}>
              {f.type === "textarea" ? (
                <Textarea {...common} {...reg} maxLength={f.maxLength} />
              ) : f.type === "select" ? (
                <NativeSelect {...common} {...reg}>
                  {!f.required && <option value="">—</option>}
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
              ) : (
                <Input {...common} {...reg} type={f.type ?? "text"} min={f.min} max={f.max} maxLength={f.maxLength} />
              )}
            </Field>
          );
        })}
      </div>
      <div><Button type="submit" loading={pending}>{submitLabel}</Button></div>
    </form>
  );
}
