"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { audit } from "@/lib/server/audit";
import { runBackgroundJobs } from "@/lib/server/jobs";
import { sanitizeContentForStorage } from "@/lib/assessment/grading";
import type { DocumentResult } from "@/lib/ai/document-worker";
import type { Json } from "@/lib/supabase/database.types";
import type { JsonObject } from "@/lib/supabase/types";
import { fieldErrors } from "@/lib/validation/auth";
import { dbErrorCode, fail, type ActionResult } from "./result";

const uuid = z.string().uuid();

export async function retryDocumentAction(jobId: string): Promise<ActionResult> {
  if (!uuid.safeParse(jobId).success) return fail("invalid");
  await requireRole("teacher");
  const supabase = await createClient();
  const { data: job } = await supabase.from("ocr_jobs").select("id, status").eq("id", jobId).maybeSingle();
  if (!job) return fail("forbidden");
  if (job.status !== "failed") return fail("invalid");
  // Owners cannot update jobs directly (no RLS update policy); the reset is done server-side after the ownership check above.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  await createAdminClient().from("ocr_jobs").update({ status: "uploaded", tries: 0, last_error: null, locked_at: null }).eq("id", jobId);
  after(() => runBackgroundJobs({ grading: 0, ocr: 1 }));
  revalidatePath(`/teacher/documents/${jobId}`);
  return { ok: true, data: undefined };
}

const createSchema = z.object({
  title: z.string().trim().min(2, "tooShort").max(200, "tooLong"),
  kind: z.enum(["sor", "soch"]),
  classId: uuid.optional().or(z.literal("")),
  subjectId: uuid.optional().or(z.literal("")),
});

/** Creates a DRAFT assessment from the AI-recognized questions. The teacher must review before publishing. */
export async function createAssessmentFromDocumentAction(jobId: string, input: Record<string, string>): Promise<ActionResult> {
  if (!uuid.safeParse(jobId).success) return fail("invalid");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const ctx = await requireRole("teacher");
  const supabase = await createClient();
  const { data: job } = await supabase.from("ocr_jobs").select("id, status, result, assessment_id, school_id").eq("id", jobId).maybeSingle();
  if (!job || job.status !== "review_required") return fail(job ? "invalid" : "forbidden");
  if (job.assessment_id) redirect(`/teacher/assessments/${job.assessment_id}/edit`);
  const result = (job.result ?? { questions: [] }) as unknown as DocumentResult;

  let grade: number | null = null;
  if (parsed.data.classId) grade = (await supabase.from("classes").select("grade").eq("id", parsed.data.classId).single()).data?.grade ?? null;
  const { data: a, error } = await supabase
    .from("assessments")
    .insert({
      school_id: job.school_id,
      created_by: ctx.userId,
      title: parsed.data.title,
      kind: parsed.data.kind,
      class_id: parsed.data.classId || null,
      subject_id: parsed.data.subjectId || null,
      grade,
      instructions: result.instructions ?? null,
      source_job_id: jobId,
    })
    .select("id")
    .single();
  if (error) return fail(dbErrorCode(error));
  if (parsed.data.classId) await supabase.from("assessment_assignments").insert({ assessment_id: a.id, class_id: parsed.data.classId });
  if (result.questions.length) {
    const { error: qErr } = await supabase.from("assessment_questions").insert(
      result.questions.map((q, i) => ({
        assessment_id: a.id,
        position: i + 1,
        type: q.type,
        content: sanitizeContentForStorage(q.type, q.content) as JsonObject,
        answer_key: q.answer_key as JsonObject,
        rubric: q.rubric as Json,
        points: q.points,
        topic: q.topic,
        learning_objective: q.learning_objective,
        ai_generated: true,
        ai_uncertain: q.uncertain,
      })),
    );
    if (qErr) return fail(dbErrorCode(qErr));
  }
  const { createAdminClient } = await import("@/lib/supabase/admin");
  await createAdminClient().from("ocr_jobs").update({ status: "completed", assessment_id: a.id }).eq("id", jobId);
  await audit({ actorId: ctx.userId, schoolId: job.school_id, action: "assessment.created_from_document", entityType: "assessment", entityId: a.id, metadata: { jobId, questions: result.questions.length } });
  redirect(`/teacher/assessments/${a.id}/edit`);
}
