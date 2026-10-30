"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { audit } from "@/lib/server/audit";
import { notifyAssessmentAssigned } from "@/lib/server/notify";
import { fieldErrors } from "@/lib/validation/auth";
import { almatyLocalToIso } from "@/lib/i18n/format";
import { QUESTION_TYPES, answerKeySchemas, contentSchemas, rubricSchema, validateQuestion, type QuestionType } from "@/lib/assessment/schema";
import { sanitizeContentForStorage } from "@/lib/assessment/grading";
import type { Json } from "@/lib/supabase/database.types";
import type { JsonObject } from "@/lib/supabase/types";
import { dbErrorCode, fail, type ActionResult } from "./result";

const uuid = z.string().uuid();

async function teacherCtx() {
  const ctx = await requireRole("teacher");
  if (!ctx.schoolId) throw new Error("forbidden");
  return { ctx, schoolId: ctx.schoolId, supabase: await createClient() };
}

function refresh(assessmentId: string) {
  revalidatePath(`/teacher/assessments/${assessmentId}`);
  revalidatePath(`/teacher/assessments/${assessmentId}/edit`);
  revalidatePath("/teacher/assessments");
}

// ---------------------------------------------------------------------------
// Create / settings
// ---------------------------------------------------------------------------
const createSchema = z.object({
  title: z.string().trim().min(2, "tooShort").max(200, "tooLong"),
  kind: z.enum(["sor", "soch"]),
  subjectId: uuid.optional().or(z.literal("")),
  classId: uuid.optional().or(z.literal("")),
});

export async function createAssessmentAction(input: Record<string, string>): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const { ctx, schoolId, supabase } = await teacherCtx();
  let grade: number | null = null;
  if (parsed.data.classId) {
    const { data: cls } = await supabase.from("classes").select("grade").eq("id", parsed.data.classId).single();
    grade = cls?.grade ?? null;
  }
  const { data, error } = await supabase
    .from("assessments")
    .insert({
      school_id: schoolId,
      created_by: ctx.userId,
      title: parsed.data.title,
      kind: parsed.data.kind,
      subject_id: parsed.data.subjectId || null,
      class_id: parsed.data.classId || null,
      grade,
    })
    .select("id")
    .single();
  if (error) return fail(dbErrorCode(error));
  if (parsed.data.classId) await supabase.from("assessment_assignments").insert({ assessment_id: data.id, class_id: parsed.data.classId });
  await audit({ actorId: ctx.userId, schoolId, action: "assessment.created", entityType: "assessment", entityId: data.id });
  redirect(`/teacher/assessments/${data.id}/edit`);
}

const settingsSchema = z
  .object({
    title: z.string().trim().min(2, "tooShort").max(200, "tooLong"),
    kind: z.enum(["sor", "soch"]),
    subjectId: uuid.nullable(),
    grade: z.number().int().min(0).max(12).nullable(),
    instructions: z.string().max(5000, "tooLong"),
    startsAt: z.string().max(30),
    dueAt: z.string().max(30),
    durationMinutes: z.number().int().min(1).max(600).nullable(),
    maxAttempts: z.number().int().min(1).max(10),
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
    allowNavigation: z.boolean(),
    lockdownMode: z.boolean(),
    releaseMode: z.enum(["manual", "on_approval"]),
    showCorrectAnswers: z.boolean(),
    allowAiExplanations: z.boolean(),
    allowAiFollowup: z.boolean(),
    allowPractice: z.boolean(),
    gradingProfile: z.enum(["strict", "balanced", "supportive"]),
  })
  .refine((v) => !v.startsAt || !v.dueAt || v.dueAt > v.startsAt, { path: ["dueAt"], message: "dateOrder" });

export type AssessmentSettingsInput = z.input<typeof settingsSchema>;

export async function updateAssessmentSettingsAction(assessmentId: string, input: AssessmentSettingsInput): Promise<ActionResult> {
  if (!uuid.safeParse(assessmentId).success) return fail("invalid");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const { ctx, schoolId, supabase } = await teacherCtx();
  const v = parsed.data;
  const { error, count } = await supabase
    .from("assessments")
    .update(
      {
        title: v.title,
        kind: v.kind,
        subject_id: v.subjectId,
        grade: v.grade,
        instructions: v.instructions || null,
        starts_at: almatyLocalToIso(v.startsAt),
        due_at: almatyLocalToIso(v.dueAt),
        duration_minutes: v.durationMinutes,
        max_attempts: v.maxAttempts,
        shuffle_questions: v.shuffleQuestions,
        shuffle_options: v.shuffleOptions,
        allow_navigation: v.allowNavigation,
        lockdown_mode: v.lockdownMode,
        release_mode: v.releaseMode,
        show_correct_answers: v.showCorrectAnswers,
        allow_ai_explanations: v.allowAiExplanations,
        allow_ai_followup: v.allowAiFollowup,
        allow_practice: v.allowPractice,
        grading_profile: v.gradingProfile,
      },
      { count: "exact" },
    )
    .eq("id", assessmentId);
  if (error || !count) return fail(error ? dbErrorCode(error) : "forbidden");
  await audit({ actorId: ctx.userId, schoolId, action: "assessment.settings_updated", entityType: "assessment", entityId: assessmentId });
  refresh(assessmentId);
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------
const questionInputSchema = z.object({
  id: uuid.optional(),
  sectionId: uuid.nullable().optional(),
  type: z.enum(QUESTION_TYPES),
  content: z.record(z.string(), z.unknown()),
  answerKey: z.record(z.string(), z.unknown()),
  rubric: rubricSchema.nullable(),
  explanation: z.string().max(5000).nullable(),
  points: z.number().positive().max(100),
  topic: z.string().max(200).nullable(),
  learningObjective: z.string().max(300).nullable(),
  revealAfterRelease: z.boolean().default(true),
});
export type QuestionInput = z.input<typeof questionInputSchema>;

/** Validates and normalizes a question; returns stored shape or an error key. */
function normalizeQuestion(input: QuestionInput): { ok: true; value: z.infer<typeof questionInputSchema> } | { ok: false; error: string } {
  const parsed = questionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const q = parsed.data;
  const content = contentSchemas[q.type].safeParse(q.content);
  const key = answerKeySchemas[q.type].safeParse(q.answerKey);
  if (!content.success || !key.success) return { ok: false, error: "invalid" };
  return {
    ok: true,
    value: {
      ...q,
      content: sanitizeContentForStorage(q.type, content.data as Record<string, unknown>),
      answerKey: key.data as Record<string, unknown>,
      topic: q.topic?.trim() || null,
      learningObjective: q.learningObjective?.trim() || null,
      explanation: q.explanation?.trim() || null,
    },
  };
}

export async function saveQuestionAction(assessmentId: string, input: QuestionInput): Promise<ActionResult<{ id: string; warning: string | null }>> {
  if (!uuid.safeParse(assessmentId).success) return fail("invalid");
  const norm = normalizeQuestion(input);
  if (!norm.ok) return fail(norm.error);
  const q = norm.value;
  const { supabase } = await teacherCtx();
  // Drafts may be incomplete; completeness is enforced again at publish time.
  const warning = validateQuestion({ type: q.type, content: q.content, answer_key: q.answerKey });
  const row = {
    assessment_id: assessmentId,
    section_id: q.sectionId ?? null,
    type: q.type,
    content: q.content as JsonObject,
    answer_key: q.answerKey as JsonObject,
    rubric: q.rubric as Json,
    explanation: q.explanation,
    points: q.points,
    topic: q.topic,
    learning_objective: q.learningObjective,
    reveal_after_release: q.revealAfterRelease,
    ai_uncertain: false,
  };
  if (q.id) {
    const { error, count } = await supabase.from("assessment_questions").update(row, { count: "exact" }).eq("id", q.id).eq("assessment_id", assessmentId);
    if (error || !count) return fail(error ? dbErrorCode(error) : "forbidden");
    refresh(assessmentId);
    return { ok: true, data: { id: q.id, warning } };
  }
  const { data: last } = await supabase.from("assessment_questions").select("position").eq("assessment_id", assessmentId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from("assessment_questions").insert({ ...row, position: (last?.position ?? 0) + 1 }).select("id").single();
  if (error) return fail(dbErrorCode(error));
  refresh(assessmentId);
  return { ok: true, data: { id: data.id, warning } };
}

export async function deleteQuestionAction(assessmentId: string, questionId: string): Promise<ActionResult> {
  if (!uuid.safeParse(questionId).success) return fail("invalid");
  const { supabase } = await teacherCtx();
  const { error } = await supabase.from("assessment_questions").delete().eq("id", questionId).eq("assessment_id", assessmentId);
  if (error) return fail(dbErrorCode(error));
  refresh(assessmentId);
  return { ok: true, data: undefined };
}

export async function duplicateQuestionAction(assessmentId: string, questionId: string): Promise<ActionResult> {
  if (!uuid.safeParse(questionId).success) return fail("invalid");
  const { supabase } = await teacherCtx();
  const { data: q } = await supabase.from("assessment_questions").select("*").eq("id", questionId).eq("assessment_id", assessmentId).single();
  if (!q) return fail("forbidden");
  const { data: all } = await supabase.from("assessment_questions").select("id, position").eq("assessment_id", assessmentId).gt("position", q.position);
  for (const r of all ?? []) await supabase.from("assessment_questions").update({ position: r.position + 1 }).eq("id", r.id);
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = q;
  const { error } = await supabase.from("assessment_questions").insert({ ...rest, position: q.position + 1 });
  if (error) return fail(dbErrorCode(error));
  refresh(assessmentId);
  return { ok: true, data: undefined };
}

export async function reorderQuestionsAction(assessmentId: string, orderedIds: string[]): Promise<ActionResult> {
  const p = z.array(uuid).max(300).safeParse(orderedIds);
  if (!p.success) return fail("invalid");
  const { supabase } = await teacherCtx();
  for (const [i, id] of p.data.entries()) {
    const { error } = await supabase.from("assessment_questions").update({ position: i + 1 }).eq("id", id).eq("assessment_id", assessmentId);
    if (error) return fail(dbErrorCode(error));
  }
  refresh(assessmentId);
  return { ok: true, data: undefined };
}

export async function moveQuestionToSectionAction(assessmentId: string, questionId: string, sectionId: string | null): Promise<ActionResult> {
  if (!uuid.safeParse(questionId).success || (sectionId && !uuid.safeParse(sectionId).success)) return fail("invalid");
  const { supabase } = await teacherCtx();
  const { error } = await supabase.from("assessment_questions").update({ section_id: sectionId }).eq("id", questionId).eq("assessment_id", assessmentId);
  if (error) return fail(dbErrorCode(error));
  refresh(assessmentId);
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
export async function saveSectionAction(assessmentId: string, input: { id?: string; title: string; instructions?: string }): Promise<ActionResult> {
  const p = z.object({ id: uuid.optional(), title: z.string().trim().min(1, "required").max(200, "tooLong"), instructions: z.string().max(2000).optional() }).safeParse(input);
  if (!p.success) return fail("validation", fieldErrors(p.error));
  const { supabase } = await teacherCtx();
  if (p.data.id) {
    const { error } = await supabase.from("assessment_sections").update({ title: p.data.title, instructions: p.data.instructions || null }).eq("id", p.data.id).eq("assessment_id", assessmentId);
    if (error) return fail(dbErrorCode(error));
  } else {
    const { count } = await supabase.from("assessment_sections").select("id", { count: "exact", head: true }).eq("assessment_id", assessmentId);
    const { error } = await supabase.from("assessment_sections").insert({ assessment_id: assessmentId, title: p.data.title, instructions: p.data.instructions || null, position: (count ?? 0) + 1 });
    if (error) return fail(dbErrorCode(error));
  }
  refresh(assessmentId);
  return { ok: true, data: undefined };
}

export async function deleteSectionAction(assessmentId: string, sectionId: string): Promise<ActionResult> {
  if (!uuid.safeParse(sectionId).success) return fail("invalid");
  const { supabase } = await teacherCtx();
  const { error } = await supabase.from("assessment_sections").delete().eq("id", sectionId).eq("assessment_id", assessmentId);
  if (error) return fail(dbErrorCode(error));
  refresh(assessmentId);
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------
export async function assignClassAction(assessmentId: string, classId: string): Promise<ActionResult> {
  if (!uuid.safeParse(classId).success) return fail("invalid");
  const { ctx, schoolId, supabase } = await teacherCtx();
  const { error } = await supabase.from("assessment_assignments").insert({ assessment_id: assessmentId, class_id: classId });
  if (error && error.code !== "23505") return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId, action: "assessment.assigned_class", entityType: "assessment", entityId: assessmentId, metadata: { classId } });
  await notifyAssessmentAssigned(assessmentId);
  refresh(assessmentId);
  return { ok: true, data: undefined };
}

export async function assignStudentsAction(assessmentId: string, studentIds: string[]): Promise<ActionResult> {
  const p = z.array(uuid).min(1).max(500).safeParse(studentIds);
  if (!p.success) return fail("invalid");
  const { ctx, schoolId, supabase } = await teacherCtx();
  const { error } = await supabase.from("assessment_assignments").upsert(
    p.data.map((s) => ({ assessment_id: assessmentId, student_id: s })),
    { onConflict: "assessment_id,student_id", ignoreDuplicates: true },
  );
  if (error && error.code !== "23505") return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId, action: "assessment.assigned_students", entityType: "assessment", entityId: assessmentId, metadata: { count: p.data.length } });
  await notifyAssessmentAssigned(assessmentId);
  refresh(assessmentId);
  return { ok: true, data: undefined };
}

export async function removeAssignmentAction(assessmentId: string, assignmentId: string): Promise<ActionResult> {
  if (!uuid.safeParse(assignmentId).success) return fail("invalid");
  const { supabase } = await teacherCtx();
  const { error } = await supabase.from("assessment_assignments").delete().eq("id", assignmentId).eq("assessment_id", assessmentId);
  if (error) return fail(dbErrorCode(error));
  refresh(assessmentId);
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
export async function publishAssessmentAction(assessmentId: string): Promise<ActionResult<{ version: number }>> {
  if (!uuid.safeParse(assessmentId).success) return fail("invalid");
  const { ctx, schoolId, supabase } = await teacherCtx();

  // Full validation of every question before creating the immutable snapshot.
  const { data: questions } = await supabase.from("assessment_questions").select("type, content, answer_key, rubric, points, position").eq("assessment_id", assessmentId).order("position");
  for (const [i, q] of (questions ?? []).entries()) {
    const problem = validateQuestion({ type: q.type as QuestionType, content: q.content as Record<string, unknown>, answer_key: q.answer_key as Record<string, unknown> });
    if (problem) return fail(`invalid_question:${i + 1}:${problem}`);
  }

  const { data: snapshotId, error } = await supabase.rpc("publish_assessment", { p_assessment: assessmentId });
  if (error) return fail(dbErrorCode(error));
  const { data: snap } = await supabase.from("assessment_snapshots").select("version").eq("id", snapshotId).single();
  await audit({ actorId: ctx.userId, schoolId, action: "assessment.published", entityType: "assessment", entityId: assessmentId, metadata: { version: snap?.version } });
  await notifyAssessmentAssigned(assessmentId);
  refresh(assessmentId);
  return { ok: true, data: { version: snap?.version ?? 1 } };
}

export async function setAssessmentStatusAction(assessmentId: string, status: "closed" | "archived" | "published"): Promise<ActionResult> {
  if (!uuid.safeParse(assessmentId).success) return fail("invalid");
  const { ctx, schoolId, supabase } = await teacherCtx();
  const { data: a } = await supabase.from("assessments").select("status, current_snapshot_id").eq("id", assessmentId).single();
  if (!a) return fail("forbidden");
  if (status === "published" && (a.status !== "closed" || !a.current_snapshot_id)) return fail("invalid");
  const { error } = await supabase.from("assessments").update({ status }).eq("id", assessmentId);
  if (error) return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId, action: `assessment.${status}`, entityType: "assessment", entityId: assessmentId });
  refresh(assessmentId);
  return { ok: true, data: undefined };
}

export async function deleteDraftAction(assessmentId: string): Promise<ActionResult> {
  if (!uuid.safeParse(assessmentId).success) return fail("invalid");
  const { ctx, schoolId, supabase } = await teacherCtx();
  const { error, count } = await supabase.from("assessments").delete({ count: "exact" }).eq("id", assessmentId).eq("status", "draft");
  if (error || !count) return fail(error ? dbErrorCode(error) : "forbidden");
  await audit({ actorId: ctx.userId, schoolId, action: "assessment.deleted", entityType: "assessment", entityId: assessmentId });
  revalidatePath("/teacher/assessments");
  redirect("/teacher/assessments");
}

// ---------------------------------------------------------------------------
// Question bank
// ---------------------------------------------------------------------------
const bankMetaSchema = z.object({
  subjectId: uuid.nullable(),
  grade: z.number().int().min(0).max(12).nullable(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  isShared: z.boolean(),
});

export async function saveBankItemAction(input: QuestionInput & z.input<typeof bankMetaSchema>): Promise<ActionResult<{ id: string; warning: string | null }>> {
  const norm = normalizeQuestion(input);
  const meta = bankMetaSchema.safeParse(input);
  if (!norm.ok || !meta.success) return fail("invalid");
  const q = norm.value;
  const { ctx, schoolId, supabase } = await teacherCtx();
  const row = {
    school_id: schoolId,
    owner_id: ctx.userId,
    subject_id: meta.data.subjectId,
    grade: meta.data.grade,
    difficulty: meta.data.difficulty,
    is_shared: meta.data.isShared,
    type: q.type,
    content: q.content as JsonObject,
    answer_key: q.answerKey as JsonObject,
    rubric: q.rubric as Json,
    explanation: q.explanation,
    points: q.points,
    topic: q.topic,
    learning_objective: q.learningObjective,
  };
  const warning = validateQuestion({ type: q.type, content: q.content, answer_key: q.answerKey });
  if (q.id) {
    const { error, count } = await supabase.from("question_bank_items").update(row, { count: "exact" }).eq("id", q.id);
    if (error || !count) return fail(error ? dbErrorCode(error) : "forbidden");
    revalidatePath("/teacher/question-bank");
    return { ok: true, data: { id: q.id, warning } };
  }
  const { data, error } = await supabase.from("question_bank_items").insert(row).select("id").single();
  if (error) return fail(dbErrorCode(error));
  revalidatePath("/teacher/question-bank");
  return { ok: true, data: { id: data.id, warning } };
}

export async function deleteBankItemAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("invalid");
  const { supabase } = await teacherCtx();
  const { error, count } = await supabase.from("question_bank_items").delete({ count: "exact" }).eq("id", id);
  if (error || !count) return fail(error ? dbErrorCode(error) : "forbidden");
  revalidatePath("/teacher/question-bank");
  return { ok: true, data: undefined };
}

export async function duplicateBankItemAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("invalid");
  const { ctx, supabase } = await teacherCtx();
  const { data: item } = await supabase.from("question_bank_items").select("*").eq("id", id).single();
  if (!item) return fail("forbidden");
  const { id: _i, created_at: _c, updated_at: _u, ...rest } = item;
  const { error } = await supabase.from("question_bank_items").insert({ ...rest, owner_id: ctx.userId, is_shared: false });
  if (error) return fail(dbErrorCode(error));
  revalidatePath("/teacher/question-bank");
  return { ok: true, data: undefined };
}

/** Copies bank items into a draft assessment. Later bank edits never affect the copy. */
export async function addBankItemsToAssessmentAction(assessmentId: string, itemIds: string[]): Promise<ActionResult<{ added: number }>> {
  const p = z.object({ a: uuid, ids: z.array(uuid).min(1).max(100) }).safeParse({ a: assessmentId, ids: itemIds });
  if (!p.success) return fail("invalid");
  const { supabase } = await teacherCtx();
  const { data: items } = await supabase.from("question_bank_items").select("*").in("id", p.data.ids);
  if (!items?.length) return fail("forbidden");
  const { data: last } = await supabase.from("assessment_questions").select("position").eq("assessment_id", assessmentId).order("position", { ascending: false }).limit(1).maybeSingle();
  let pos = last?.position ?? 0;
  const rows = items.map((it) => ({
    assessment_id: assessmentId,
    bank_item_id: it.id,
    position: ++pos,
    type: it.type,
    content: it.content,
    answer_key: it.answer_key,
    rubric: it.rubric,
    explanation: it.explanation,
    points: it.points,
    topic: it.topic,
    learning_objective: it.learning_objective,
  }));
  const { error } = await supabase.from("assessment_questions").insert(rows);
  if (error) return fail(dbErrorCode(error));
  refresh(assessmentId);
  return { ok: true, data: { added: rows.length } };
}

export async function saveQuestionToBankAction(assessmentId: string, questionId: string): Promise<ActionResult> {
  if (!uuid.safeParse(questionId).success) return fail("invalid");
  const { ctx, schoolId, supabase } = await teacherCtx();
  const [{ data: q }, { data: a }] = await Promise.all([
    supabase.from("assessment_questions").select("*").eq("id", questionId).eq("assessment_id", assessmentId).single(),
    supabase.from("assessments").select("subject_id, grade").eq("id", assessmentId).single(),
  ]);
  if (!q) return fail("forbidden");
  const { error } = await supabase.from("question_bank_items").insert({
    school_id: schoolId,
    owner_id: ctx.userId,
    subject_id: a?.subject_id ?? null,
    grade: a?.grade ?? null,
    type: q.type,
    content: q.content,
    answer_key: q.answer_key,
    rubric: q.rubric,
    explanation: q.explanation,
    points: q.points,
    topic: q.topic,
    learning_objective: q.learning_objective,
  });
  if (error) return fail(dbErrorCode(error));
  revalidatePath("/teacher/question-bank");
  return { ok: true, data: undefined };
}
