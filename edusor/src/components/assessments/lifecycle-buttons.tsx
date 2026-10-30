"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import { publishAssessmentAction } from "@/lib/actions/assessments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/misc";
import { fmt } from "@/lib/utils";

export function PublishButton({ assessmentId, republish }: { assessmentId: string; republish: boolean }) {
  const { d } = useI18n();
  const te = useTranslateError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const message = (code: string) => {
    if (code.startsWith("invalid_question:")) {
      const [, n, reason] = code.split(":");
      return fmt(d.assessment.errors.invalid_question, { n: n ?? "?", reason: (d.questions.validation as Record<string, string>)[reason ?? ""] ?? "" });
    }
    return (d.assessment.errors as Record<string, string>)[code] ?? te(code);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setError(null); }}>
      <DialogTrigger asChild><Button><Send /> {republish ? d.assessment.republish : d.assessment.publish}</Button></DialogTrigger>
      <DialogContent
        title={republish ? d.assessment.republish : d.assessment.publish}
        description={d.assessment.publishConfirm}
        footer={
          <>
            <DialogClose asChild><Button variant="secondary">{d.common.cancel}</Button></DialogClose>
            <Button loading={pending} onClick={() => start(async () => {
              const res = await publishAssessmentAction(assessmentId);
              if (res.ok) { setOpen(false); router.refresh(); } else setError(res.error);
            })}>{d.assessment.publish}</Button>
          </>
        }
      >
        {error && <Alert tone="danger">{message(error)}</Alert>}
      </DialogContent>
    </Dialog>
  );
}
