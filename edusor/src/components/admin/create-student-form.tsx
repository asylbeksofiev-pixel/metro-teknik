"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStudentLoginAction } from "@/lib/actions/admin";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { CopyField } from "./invite-form";

export function CreateStudentForm({ classes }: { classes: { id: string; name: string }[] }) {
  const { d } = useI18n();
  const te = useTranslateError();
  const router = useRouter();
  const [values, setValues] = useState({ fullName: "", login: "", studentCode: "", classId: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<{ login: string; password: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setErrors({});
          setError(null);
          setCreds(null);
          const res = await createStudentLoginAction({ ...values, classId: values.classId || null });
          if (res.ok) { setCreds(res.data); setValues({ fullName: "", login: "", studentCode: "", classId: values.classId }); router.refresh(); }
          else if (res.fieldErrors) setErrors(res.fieldErrors);
          else setError(res.error);
        });
      }}
    >
      <p className="text-[13px] text-muted-foreground">{d.admin.createStudentHint}</p>
      {error && <Alert tone="danger">{te(error)}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={d.common.fullName} htmlFor="cs-name" error={te(errors.fullName)}><Input id="cs-name" value={values.fullName} onChange={set("fullName")} /></Field>
        <Field label={d.admin.login} htmlFor="cs-login" error={te(errors.login)}><Input id="cs-login" value={values.login} onChange={set("login")} autoCapitalize="none" placeholder="aidar.s7a" /></Field>
        <Field label={d.teacher.studentCode} htmlFor="cs-code" error={te(errors.studentCode)}><Input id="cs-code" value={values.studentCode} onChange={set("studentCode")} /></Field>
        <Field label={d.common.class} htmlFor="cs-class">
          <NativeSelect id="cs-class" value={values.classId} onChange={set("classId")}>
            <option value="">—</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <div><Button type="submit" loading={pending} disabled={!values.fullName || !values.login}>{d.admin.createStudent}</Button></div>
      {creds && (
        <div className="flex flex-col gap-2 rounded-md border border-success/30 bg-success-soft p-3">
          <p className="text-[13px] font-medium">{d.admin.credentialsCreated}</p>
          <Field label={d.admin.login}><CopyField value={creds.login} /></Field>
          <Field label={d.admin.tempPassword}><CopyField value={creds.password} /></Field>
        </div>
      )}
    </form>
  );
}
