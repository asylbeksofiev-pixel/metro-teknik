"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitationAction, requestTeacherAccessAction } from "@/lib/actions/onboarding";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";

function useOnboardingError() {
  const { d } = useI18n();
  return (code: string) => (d.onboarding.errors as Record<string, string>)[code] ?? (d.errors as Record<string, string>)[code] ?? d.errors.generic;
}

export function AcceptInviteForm({ initialToken }: { initialToken?: string }) {
  const { d } = useI18n();
  const msg = useOnboardingError();
  const router = useRouter();
  const [token, setToken] = useState(initialToken ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const autoTried = useRef(false);

  const submit = (value: string) =>
    start(async () => {
      setError(null);
      const res = await acceptInvitationAction(value);
      if (res.ok) router.replace("/app");
      else setError(res.error);
    });

  useEffect(() => {
    if (initialToken && !autoTried.current) {
      autoTried.current = true;
      submit(initialToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken]);

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(token); }} className="flex flex-col gap-3">
      {error && <Alert tone="danger">{msg(error)}</Alert>}
      <Field label={d.onboarding.inviteCode} htmlFor="invite">
        <Input id="invite" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
      </Field>
      <Button type="submit" loading={pending} disabled={!token.trim()}>{d.onboarding.acceptInvite}</Button>
    </form>
  );
}

export function TeacherRequestForm() {
  const { d } = useI18n();
  const msg = useOnboardingError();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<{ error?: string; done?: boolean }>({});
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await requestTeacherAccessAction(code, message);
          setState(res.ok ? { done: true } : { error: res.error });
        });
      }}
      className="flex flex-col gap-3"
    >
      {state.error && <Alert tone="danger">{msg(state.error)}</Alert>}
      {state.done && <Alert tone="success">{d.onboarding.requestSent}</Alert>}
      <Field label={d.onboarding.schoolCode} htmlFor="code">
        <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} autoComplete="off" />
      </Field>
      <Field label={d.onboarding.message} htmlFor="message">
        <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
      </Field>
      <Button type="submit" variant="secondary" loading={pending} disabled={code.trim().length < 4}>{d.onboarding.sendRequest}</Button>
    </form>
  );
}
