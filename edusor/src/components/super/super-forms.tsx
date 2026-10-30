"use client";

import { useState, useTransition } from "react";
import { inviteSchoolAdminAction, testAiAction } from "@/lib/actions/super-admin";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { CopyField } from "@/components/admin/invite-form";
import { fmt } from "@/lib/utils";

export function InviteAdminForm({ schoolId }: { schoolId: string }) {
  const { d } = useI18n();
  const te = useTranslateError();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ link?: string; error?: string }>({});
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await inviteSchoolAdminAction(schoolId, email); setState(r.ok ? { link: r.data.link } : { error: r.fieldErrors?.email ?? r.error }); }); }}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={d.common.email} aria-label={d.common.email} className="h-8" />
        <Button size="sm" type="submit" loading={pending} disabled={!email}>{d.superAdmin.inviteAdmin}</Button>
      </form>
      {state.error && <Alert tone="danger">{te(state.error)}</Alert>}
      {state.link && <CopyField value={state.link} />}
    </div>
  );
}

export function TestAiButton() {
  const { d } = useI18n();
  const [res, setRes] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div><Button variant="secondary" loading={pending} onClick={() => start(async () => { const r = await testAiAction(); setOk(r.ok); setRes(r.ok ? fmt(d.superAdmin.aiTestOk, { ms: r.data.ms }) : fmt(d.superAdmin.aiTestFail, { error: r.error })); })}>{d.superAdmin.testAi}</Button></div>
      {res && <Alert tone={ok ? "success" : "danger"}>{res}</Alert>}
    </div>
  );
}
