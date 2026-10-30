"use server";

import { z } from "zod";
import { createClient, type ServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { rateLimit } from "@/lib/server/rate-limit";
import { getLocale } from "@/lib/i18n/server";
import { subjectName } from "@/lib/i18n/format";
import { describeKey, describeResponse } from "@/lib/assessment/describe";
import { gradeResponse } from "@/lib/assessment/grading";
import { newItemId, type QuestionType, type Rubric, type SnapshotQuestion } from "@/lib/assessment/schema";
import { explainMistake, followUp, generatePractice, type ReleasedContext } from "@/lib/ai/tasks";
import { aiConfigured } from "@/lib/ai/client";
import type { Json } from "@/lib/supabase/database.types";
import { fail, type ActionResult } from "./result";

const uuid = z.string().uuid();
type Msg = { role: "user" | "assistant"; content: string };

/**
 * Builds the AI context strictly from what this student can read through RLS:
 * their own answer, a released score, and the key/rubric only when the teacher revealed it.
 */
async function releasedContext(supabase: ServerClient, studentId: string, answerId: string) {
  const { data: answer } = await supabase
    .from("answers")
    .select("id, question_id, response, attempt:attempts(id, student_id, snapshot_id, assessment:assessments(grade, allow_ai_explanations, allow_ai_followup, allow_practice, subject:subjects(name_ru, name_kk)))")
    .eq("id", answerId)
    .maybeSingle();
  if (!answer?.attempt?.assessment || answer.attempt.student_id !== studentId) return null;
  const [{ data: release }, { data: score }, { data: snap }, { data: key }] = await Promise.all([
    supabase.from("result_releases").select("attempt_id").eq("attempt_id", answer.attempt.id).maybeSingle(),
    supabase.from("question_scores").select("final_points, max_points, teacher_feedback").eq("answer_id", answerId).maybeSingle(),
    supabase.from("assessment_snapshots").select("questions").eq("id", answer.attempt.snapshot_id).single(),
    supabase.from("assessment_snapshot_keys").select("answer_key, rubric, explanation").eq("snapshot_id", answer.attempt.snapshot_id).eq("question_id", answer.question_id).maybeSingle(),
  ]);
  if (!release || !score) return null;
  const q = ((snap?.questions ?? []) as SnapshotQuestion[]).find((x) => x.id === answer.question_id);
  if (!q) return null;
  const type = q.type as QuestionType;
  const locale = await getLocale();
  const a = answer.attempt.assessment;
  const ctx: ReleasedContext = {
    questionText: String(q.content.prompt ?? ""),
    questionType: type,
    studentAnswer: describeResponse(type, q.content, answer.response),
    correctAnswer: key ? describeKey(type, q.content, key.answer_key) : null,
    rubric: (key?.rubric as Rubric | null) ?? null,
    teacherExplanation: key?.explanation ?? null,
    teacherFeedback: score.teacher_feedback,
    awarded: score.final_points === null ? null : Number(score.final_points),
    maxPoints: Number(score.max_points),
    subject: a.subject ? subjectName(a.subject, locale) : null,
    grade: a.grade,
  };
  return { ctx, keyVisible: !!key, flags: a, topic: q.topic, locale };
}

export async function explainAction(answerId: string): Promise<ActionResult<{ text: string }>> {
  if (!uuid.safeParse(answerId).success) return fail("invalid");
  const session = await requireRole("student");
  const supabase = await createClient();
  const rc = await releasedContext(supabase, session.userId, answerId);
  if (!rc) return fail("forbidden");
  if (!rc.flags.allow_ai_explanations) return fail("aiDisabled");
  if (!rc.keyVisible) return fail("aiNeedsKey");
  const { data: cached } = await supabase.from("ai_explanations").select("messages").eq("answer_id", answerId).eq("locale", rc.locale).maybeSingle();
  const first = (cached?.messages as Msg[] | undefined)?.[0];
  if (first) return { ok: true, data: { text: first.content } };
  if (!aiConfigured()) return fail("aiUnavailable");
  if (!(await rateLimit(`explain:${session.userId}`, 40, 3600))) return fail("rateLimited");
  const res = await explainMistake(rc.ctx, rc.locale, { userId: session.userId, schoolId: session.schoolId });
  if (!res.ok) return fail("aiFailed");
  await createAdminClient().from("ai_explanations").upsert(
    { answer_id: answerId, student_id: session.userId, locale: rc.locale, messages: [{ role: "assistant", content: res.data.explanation }] as NonNullable<Json>, model: res.model },
    { onConflict: "answer_id,locale" },
  );
  return { ok: true, data: { text: res.data.explanation } };
}

export async function followUpAction(answerId: string, message: string): Promise<ActionResult<{ messages: Msg[] }>> {
  const parsed = z.object({ id: uuid, m: z.string().trim().min(1).max(1000) }).safeParse({ id: answerId, m: message });
  if (!parsed.success) return fail("invalid");
  const session = await requireRole("student");
  const supabase = await createClient();
  const rc = await releasedContext(supabase, session.userId, answerId);
  if (!rc) return fail("forbidden");
  if (!rc.flags.allow_ai_followup || !rc.flags.allow_ai_explanations) return fail("followupDisabled");
  if (!rc.keyVisible) return fail("aiNeedsKey");
  if (!aiConfigured()) return fail("aiUnavailable");
  if (!(await rateLimit(`followup:${session.userId}`, 30, 3600))) return fail("rateLimited");
  const { data: row } = await supabase.from("ai_explanations").select("messages").eq("answer_id", answerId).eq("locale", rc.locale).maybeSingle();
  const history = ((row?.messages as Msg[] | undefined) ?? []).slice(-20);
  const res = await followUp(rc.ctx, history, parsed.data.m, rc.locale, { userId: session.userId, schoolId: session.schoolId });
  if (!res.ok) return fail("aiFailed");
  const messages: Msg[] = [...history, { role: "user", content: parsed.data.m }, { role: "assistant", content: res.data.answer }];
  await createAdminClient().from("ai_explanations").upsert(
    { answer_id: answerId, student_id: session.userId, locale: rc.locale, messages: messages as NonNullable<Json>, model: res.model },
    { onConflict: "answer_id,locale" },
  );
  return { ok: true, data: { messages } };
}

export type PracticeView = { id: string; type: "single_choice" | "numeric" | "short_text"; prompt: string; options: { id: string; text: string }[] };

/** Generates an AI practice question. Its key stays on the server; it never affects grades. */
export async function practiceAction(answerId: string): Promise<ActionResult<PracticeView>> {
  if (!uuid.safeParse(answerId).success) return fail("invalid");
  const session = await requireRole("student");
  const supabase = await createClient();
  const rc = await releasedContext(supabase, session.userId, answerId);
  if (!rc) return fail("forbidden");
  if (!rc.flags.allow_practice) return fail("practiceDisabled");
  if (!aiConfigured()) return fail("aiUnavailable");
  if (!(await rateLimit(`practice:${session.userId}`, 30, 3600))) return fail("rateLimited");
  const res = await generatePractice({ ...rc.ctx, topic: rc.topic }, rc.locale, { userId: session.userId, schoolId: session.schoolId });
  if (!res.ok) return fail("aiFailed");
  const p = res.data;
  const options = (p.options ?? []).map((text) => ({ id: newItemId(), text }));
  const content = { prompt: p.prompt, images: [], ...(p.type === "single_choice" ? { options } : {}) };
  const answerKey =
    p.type === "single_choice" ? { correct: options[p.correctOptionIndex ?? -1]?.id ?? null }
    : p.type === "numeric" ? { value: p.numericAnswer ?? null, tolerance: Math.abs(p.numericTolerance ?? 0) }
    : { accepted: p.acceptedAnswers ?? [], caseSensitive: false };
  if (p.type === "single_choice" && !answerKey.correct) return fail("aiFailed");
  const { data, error } = await createAdminClient()
    .from("practice_questions")
    .insert({ student_id: session.userId, source_answer_id: answerId, topic: rc.topic, locale: rc.locale, type: p.type, content: content as NonNullable<Json>, answer_key: answerKey as NonNullable<Json>, explanation: p.explanation, model: res.model })
    .select("id")
    .single();
  if (error) return fail("generic");
  return { ok: true, data: { id: data.id, type: p.type, prompt: p.prompt, options } };
}

export async function checkPracticeAction(practiceId: string, response: Record<string, unknown>): Promise<ActionResult<{ correct: boolean; answer: string; explanation: string | null }>> {
  if (!uuid.safeParse(practiceId).success) return fail("invalid");
  const session = await requireRole("student");
  const supabase = await createClient();
  const { data: p } = await supabase.from("practice_questions").select("id, type, content, answer_key, explanation").eq("id", practiceId).eq("student_id", session.userId).maybeSingle();
  if (!p) return fail("forbidden");
  const type = p.type as QuestionType;
  const g = gradeResponse(type, p.answer_key, response, 1, p.content);
  const correct = g.result === "correct";
  await createAdminClient().from("practice_questions").update({ student_response: response as Json, checked_result: g.result }).eq("id", practiceId);
  return { ok: true, data: { correct, answer: describeKey(type, p.content, p.answer_key) ?? "—", explanation: p.explanation } };
}
