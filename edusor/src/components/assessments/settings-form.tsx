"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { useTranslateError } from "@/lib/i18n/use-tv";
import { updateAssessmentSettingsAction, type AssessmentSettingsInput } from "@/lib/actions/assessments";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";

export function AssessmentSettingsForm({ assessmentId, initial, subjects }: { assessmentId: string; initial: AssessmentSettingsInput; subjects: { id: string; name: string }[] }) {
  const { d } = useI18n();
  const te = useTranslateError();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ ok?: boolean; error?: string }>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof AssessmentSettingsInput>(k: K, val: AssessmentSettingsInput[K]) => setV((p) => ({ ...p, [k]: val }));

  const submit = () =>
    start(async () => {
      setErrors({});
      setStatus({});
      const res = await updateAssessmentSettingsAction(assessmentId, v);
      if (res.ok) {
        setStatus({ ok: true });
        router.refresh();
      } else if (res.fieldErrors) setErrors(res.fieldErrors);
      else setStatus({ error: res.error });
    });

  const toggles: [keyof AssessmentSettingsInput, string, string?][] = [
    ["shuffleQuestions", d.assessment.shuffleQuestions],
    ["shuffleOptions", d.assessment.shuffleOptions],
    ["allowNavigation", d.assessment.allowNavigation],
    ["lockdownMode", d.assessment.lockdownMode, d.assessment.lockdownHint],
    ["showCorrectAnswers", d.assessment.showCorrect],
    ["allowAiExplanations", d.assessment.allowAiExplanations],
    ["allowAiFollowup", d.assessment.allowAiFollowup],
    ["allowPractice", d.assessment.allowPractice],
  ];

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      {status.error && <Alert tone="danger">{te(status.error)}</Alert>}
      {status.ok && <Alert tone="success">{d.common.saved}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={d.assessment.title} htmlFor="s-title" error={te(errors.title)} className="sm:col-span-2">
          <Input id="s-title" value={v.title} maxLength={200} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label={d.assessment.kindLabel} htmlFor="s-kind">
          <NativeSelect id="s-kind" value={v.kind} onChange={(e) => set("kind", e.target.value as "sor" | "soch")}>
            <option value="sor">{d.assessment.kind.sor}</option>
            <option value="soch">{d.assessment.kind.soch}</option>
          </NativeSelect>
        </Field>
        <Field label={d.common.subject} htmlFor="s-subject">
          <NativeSelect id="s-subject" value={v.subjectId ?? ""} onChange={(e) => set("subjectId", e.target.value || null)}>
            <option value="">—</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label={d.assessment.startsAt} htmlFor="s-start" error={te(errors.startsAt)}>
          <Input id="s-start" type="datetime-local" value={v.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
        </Field>
        <Field label={d.assessment.dueAt} htmlFor="s-due" error={te(errors.dueAt)}>
          <Input id="s-due" type="datetime-local" value={v.dueAt} onChange={(e) => set("dueAt", e.target.value)} />
        </Field>
        <Field label={d.assessment.duration} htmlFor="s-dur" hint={d.assessment.durationHint} error={te(errors.durationMinutes)}>
          <Input id="s-dur" inputMode="numeric" value={v.durationMinutes ?? ""} onChange={(e) => set("durationMinutes", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label={d.assessment.maxAttempts} htmlFor="s-att" error={te(errors.maxAttempts)}>
          <Input id="s-att" inputMode="numeric" value={v.maxAttempts} onChange={(e) => set("maxAttempts", Number(e.target.value) || 1)} />
        </Field>
        <Field label={d.assessment.instructions} htmlFor="s-instr" className="sm:col-span-2" error={te(errors.instructions)}>
          <Textarea id="s-instr" rows={3} maxLength={5000} value={v.instructions} onChange={(e) => set("instructions", e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {toggles.map(([key, label, hint]) => (
          <Switch key={key} id={`s-${key}`} checked={Boolean(v[key])} onCheckedChange={(val) => set(key, val as never)} label={label} hint={hint} />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={d.assessment.releaseMode} htmlFor="s-release">
          <NativeSelect id="s-release" value={v.releaseMode} onChange={(e) => set("releaseMode", e.target.value as "manual" | "on_approval")}>
            <option value="manual">{d.assessment.releaseManual}</option>
            <option value="on_approval">{d.assessment.releaseOnApproval}</option>
          </NativeSelect>
        </Field>
        <Field label={d.assessment.gradingProfile} htmlFor="s-profile" hint={d.assessment.profileHint}>
          <NativeSelect id="s-profile" value={v.gradingProfile} onChange={(e) => set("gradingProfile", e.target.value as "strict" | "balanced" | "supportive")}>
            {(["strict", "balanced", "supportive"] as const).map((p) => <option key={p} value={p}>{d.assessment.profiles[p]}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <div><Button type="submit" loading={pending}>{d.common.save}</Button></div>
    </form>
  );
}
