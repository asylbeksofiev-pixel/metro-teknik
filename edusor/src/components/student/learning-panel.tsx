"use client";

import { useState, useTransition } from "react";
import { Bot, Dumbbell, Send } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { checkPracticeAction, explainAction, followUpAction, practiceAction, type PracticeView } from "@/lib/actions/learning";
import { RichText, InlineRich } from "@/components/content/rich-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { fmt } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

export function LearningPanel({ answerId, allowExplain, allowFollowup, allowPractice, keyVisible, initial }: { answerId: string; allowExplain: boolean; allowFollowup: boolean; allowPractice: boolean; keyVisible: boolean; initial: Msg[] }) {
  const { d } = useI18n();
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [practice, setPractice] = useState<PracticeView | null>(null);
  const [practiceResponse, setPracticeResponse] = useState<Record<string, unknown>>({});
  const [checked, setChecked] = useState<{ correct: boolean; answer: string; explanation: string | null } | null>(null);
  const [pending, start] = useTransition();
  const msg = (code: string) =>
    ({ aiDisabled: d.results.aiDisabled, aiNeedsKey: d.results.aiNeedsKey, followupDisabled: d.results.followupDisabled, practiceDisabled: d.results.practiceDisabled, aiUnavailable: d.errors.aiUnavailable, aiFailed: d.errors.aiFailed, rateLimited: d.errors.rateLimited } as Record<string, string>)[code] ?? d.errors.generic;

  const ask = (text: string) =>
    start(async () => {
      setError(null);
      const res = await followUpAction(answerId, text);
      if (res.ok) { setMessages(res.data.messages); setInput(""); } else setError(msg(res.error));
    });

  const canExplain = allowExplain && keyVisible;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-info/30 bg-info-soft/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="size-4 text-info" />
        <span className="text-sm font-semibold">{d.results.aiTitle}</span>
        <Badge tone="info">{d.common.aiGenerated}</Badge>
      </div>
      {!allowExplain ? <p className="text-sm text-muted-foreground">{d.results.aiDisabled}</p> : !keyVisible ? <p className="text-sm text-muted-foreground">{d.results.aiNeedsKey}</p> : messages.length === 0 ? (
        <div><Button size="sm" loading={pending} onClick={() => start(async () => { setError(null); const r = await explainAction(answerId); if (r.ok) setMessages([{ role: "assistant", content: r.data.text }]); else setError(msg(r.error)); })}>{pending ? d.results.aiExplaining : d.results.aiExplain}</Button></div>
      ) : (
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-8 rounded-md bg-surface px-3 py-2 text-sm" : "text-sm"}>
              {m.role === "user" ? m.content : <RichText text={m.content} />}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{d.results.aiDisclaimer}</p>
          {allowFollowup ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {d.results.suggestions.map((s) => <Button key={s} size="sm" variant="secondary" disabled={pending} onClick={() => ask(s)}>{s}</Button>)}
              </div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (input.trim()) ask(input); }}>
                <Input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder={d.results.askPlaceholder} aria-label={d.results.askPlaceholder} />
                <Button type="submit" loading={pending} disabled={!input.trim()}><Send /> <span className="sr-only sm:not-sr-only">{d.results.ask}</span></Button>
              </form>
            </>
          ) : <p className="text-xs text-muted-foreground">{d.results.followupDisabled}</p>}
        </div>
      )}
      {error && <Alert tone="danger">{error}</Alert>}

      {allowPractice && canExplain !== undefined && (
        <div className="border-t border-info/20 pt-3">
          {!practice ? (
            <Button size="sm" variant="soft" disabled={pending} onClick={() => start(async () => { setError(null); setChecked(null); setPracticeResponse({}); const r = await practiceAction(answerId); if (r.ok) setPractice(r.data); else setError(msg(r.error)); })}>
              <Dumbbell /> {pending ? d.results.practiceGenerating : d.results.practice}
            </Button>
          ) : (
            <div className="flex flex-col gap-3 rounded-md bg-surface p-3">
              <p className="text-xs font-medium text-info">{d.results.practiceTitle} · {d.results.practiceNote}</p>
              <RichText text={practice.prompt} className="text-sm" />
              {practice.type === "single_choice" ? (
                <div className="flex flex-col gap-1.5">
                  {practice.options.map((o, i) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm">
                      <input type="radio" name={`pr-${practice.id}`} checked={practiceResponse.optionId === o.id} onChange={() => setPracticeResponse({ optionId: o.id })} />
                      <span className="text-xs text-muted-foreground">{String.fromCharCode(65 + i)}.</span> <InlineRich text={o.text} />
                    </label>
                  ))}
                </div>
              ) : (
                <Input className="max-w-60" inputMode={practice.type === "numeric" ? "decimal" : undefined} aria-label={d.attempt.yourAnswer} value={String(practiceResponse[practice.type === "numeric" ? "value" : "text"] ?? "")} onChange={(e) => setPracticeResponse(practice.type === "numeric" ? { value: e.target.value } : { text: e.target.value })} />
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={pending || Object.keys(practiceResponse).length === 0} onClick={() => start(async () => { const r = await checkPracticeAction(practice.id, practiceResponse); if (r.ok) setChecked(r.data); else setError(msg(r.error)); })}>{d.results.practiceCheck}</Button>
                <Button size="sm" variant="ghost" onClick={() => setPractice(null)}>{d.results.practice}</Button>
              </div>
              {checked && (
                <Alert tone={checked.correct ? "success" : "warning"}>
                  {checked.correct ? d.results.practiceCorrect : fmt(d.results.practiceIncorrect, { answer: checked.answer.replace(/\$/g, "") })}
                  {checked.explanation && <RichText text={checked.explanation} className="mt-1" />}
                </Alert>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
