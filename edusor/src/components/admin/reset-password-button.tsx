"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { resetStudentPasswordAction } from "@/lib/actions/admin";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/misc";
import { CopyField } from "./invite-form";

export function ResetPasswordButton({ studentId }: { studentId: string }) {
  const { d } = useI18n();
  const te = useTranslateError();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ password?: string; error?: string }>({});
  return (
    <Dialog onOpenChange={(o) => !o && setResult({})}>
      <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label={d.admin.tempPassword}><KeyRound /></Button></DialogTrigger>
      <DialogContent title={d.admin.tempPassword} description={d.admin.createStudentHint}>
        {result.error && <Alert tone="danger">{te(result.error)}</Alert>}
        {result.password ? (
          <CopyField value={result.password} />
        ) : (
          <Button loading={pending} onClick={() => start(async () => { const r = await resetStudentPasswordAction(studentId); setResult(r.ok ? { password: r.data.password } : { error: r.error }); })}>
            {d.common.confirm}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
