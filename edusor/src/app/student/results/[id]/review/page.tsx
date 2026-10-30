import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { loadStudentResult } from "@/lib/data/student-result";
import { describeKey } from "@/lib/assessment/describe";
import { PageHeader, Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { RichText } from "@/components/content/rich-text";
import { QuestionView } from "@/components/questions/question-view";
import { LearningPanel } from "@/components/student/learning-panel";
import { fmt, formatPoints } from "@/lib/utils";

const TONE = { correct: "success", incorrect: "danger", partial: "warning", unanswered: "neutral", pending: "info" } as const;
type Msg = { role: "user" | "assistant"; content: string };

export default async function ResultReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("student");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const r = await loadStudentResult(supabase, ctx.userId, id);
  if (!r?.released) notFound();
  const a = r.attempt.assessment!;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={fmt(d.results.reviewTitle, { title: a.title })} breadcrumb={<Link href={`/student/results/${id}`} className="hover:underline">{d.results.title}</Link>} />
      {!a.show_correct_answers && <Alert tone="info" className="mb-4">{d.results.correctHidden}</Alert>}
      <div className="flex flex-col gap-5">
        {r.items.map((it) => {
          const correct = it.key ? describeKey(it.type, it.content, it.key.answerKey, d.questions.trueLabel, d.questions.falseLabel) : null;
          const wrong = it.result !== "correct";
          return (
            <article key={it.questionId} className="rounded-lg border border-border bg-surface p-5 shadow-card">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded bg-muted text-xs font-semibold">{it.index}</span>
                <Badge tone={TONE[it.result as keyof typeof TONE] ?? "neutral"}>{(d.grading.results as Record<string, string>)[it.result]}</Badge>
                {it.topic && <span className="text-xs text-muted-foreground">{it.topic}</span>}
                <span className="ml-auto text-sm font-semibold tabular-nums">{d.results.awarded}: {formatPoints(it.points)} / {formatPoints(it.max)}</span>
              </div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{d.results.yourAnswer}</p>
              <QuestionView question={{ id: it.questionId, type: it.type, content: it.content, points: it.max }} response={it.response} disabled />
              {correct && (
                <div className="mt-4 rounded-md border border-success/30 bg-success-soft/50 p-3">
                  <p className="mb-1 text-xs font-medium text-success">{d.results.correctAnswer}</p>
                  <RichText text={correct} className="text-sm" />
                </div>
              )}
              {it.key?.explanation && (
                <div className="mt-3 text-sm"><p className="text-xs font-medium text-muted-foreground">{d.results.explanation}</p><RichText text={it.key.explanation} /></div>
              )}
              {it.feedback && (
                <div className="mt-3 rounded-md bg-muted/60 p-3 text-sm"><p className="text-xs font-medium text-muted-foreground">{d.results.teacherComment}</p>{it.feedback}</div>
              )}
              {wrong && it.answerId && (
                <div className="mt-4">
                  <LearningPanel
                    answerId={it.answerId}
                    allowExplain={a.allow_ai_explanations}
                    allowFollowup={a.allow_ai_followup}
                    allowPractice={a.allow_practice}
                    keyVisible={!!it.key}
                    initial={((it.chats.find((c) => c.locale === locale)?.messages ?? []) as Msg[])}
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
