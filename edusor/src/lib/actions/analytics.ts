"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { loadAssessmentAnalytics } from "@/lib/data/assessment-analytics";
import { summarizeErrors } from "@/lib/ai/tasks";
import { aiConfigured } from "@/lib/ai/client";
import { rateLimit } from "@/lib/server/rate-limit";
import { getLocale } from "@/lib/i18n/server";
import type { Rubric } from "@/lib/assessment/schema";
import { fail, type ActionResult } from "./result";

/** AI summary of recurring errors for one open question. Answers are sent without student names. */
export async function summarizeQuestionAction(assessmentId: string, questionId: string): Promise<ActionResult<{ summary: string; patterns: { pattern: string; count: number }[] }>> {
  if (!z.string().uuid().safeParse(assessmentId).success || !z.string().uuid().safeParse(questionId).success) return fail("invalid");
  const ctx = await requireRole("teacher");
  if (!aiConfigured()) return fail("aiUnavailable");
  if (!(await rateLimit(`summary:${ctx.userId}`, 20, 3600))) return fail("rateLimited");
  const supabase = await createClient();
  const data = await loadAssessmentAnalytics(supabase, assessmentId);
  const q = data?.questions.find((x) => x.id === questionId);
  if (!data || !q) return fail("forbidden");
  const answers = q.responses.filter((r) => r.text.trim()).map((r) => ({ text: r.text, points: r.points, max: q.maxPoints }));
  if (!answers.length) return fail("invalid");
  const { data: a } = await supabase.from("assessments").select("current_snapshot_id").eq("id", assessmentId).single();
  const { data: key } = await supabase.from("assessment_snapshot_keys").select("answer_key, rubric").eq("snapshot_id", a!.current_snapshot_id!).eq("question_id", questionId).maybeSingle();
  const res = await summarizeErrors(
    { questionText: q.prompt, reference: String((key?.answer_key as { referenceAnswer?: string } | null)?.referenceAnswer ?? ""), rubric: (key?.rubric as Rubric | null) ?? null, answers: answers.slice(0, 60) },
    await getLocale(),
    { userId: ctx.userId, schoolId: ctx.schoolId },
  );
  if (!res.ok) return fail("aiFailed");
  return { ok: true, data: res.data };
}
