"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { createInvitationAction } from "@/lib/actions/admin";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";

export function CopyField({ value }: { value: string }) {
  const { d } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
      <Button type="button" variant="secondary" size="icon" aria-label={d.common.copy} onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

export function InviteForm({ role, classes }: { role: "teacher" | "student" | "school_admin"; classes?: { id: string; name: string }[] }) {
  const { d } = useI18n();
  const te = useTranslateError();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [classId, setClassId] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          setLink(null);
          const res = await createInvitationAction({ email, role, classId: classId || null });
          if (res.ok) { setLink(res.data.link); setEmail(""); router.refresh(); }
          else setError(res.fieldErrors?.email ?? res.error);
        });
      }}
    >
      {error && <Alert tone="danger">{te(error)}</Alert>}
      <Field label={d.common.email} htmlFor={`invite-${role}`}>
        <Input id={`invite-${role}`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {classes && (
        <Field label={d.common.class} htmlFor={`invite-class-${role}`}>
          <NativeSelect id={`invite-class-${role}`} value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">—</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
      )}
      <div><Button type="submit" loading={pending} disabled={!email}>{d.admin.invite}</Button></div>
      {link && (
        <div className="flex flex-col gap-2">
          <Alert tone="success">{d.admin.invitationCreated}</Alert>
          <CopyField value={link} />
        </div>
      )}
    </form>
  );
}
