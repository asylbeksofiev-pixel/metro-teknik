"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { dbErrorCode, fail, type ActionResult } from "./result";

export async function startAttemptAction(assessmentId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(assessmentId).success) return fail("forbidden");
  await requireRole("student");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_attempt", { p_assessment: assessmentId });
  if (error || !data) return fail(dbErrorCode(error));
  redirect(`/student/attempts/${data}`);
}
