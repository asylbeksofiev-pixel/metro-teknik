"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/server/audit";
import { dbErrorCode, fail, type ActionResult } from "./result";

export async function acceptInvitationAction(token: string): Promise<ActionResult> {
  const parsed = z.string().min(16).max(200).safeParse(token.trim());
  if (!parsed.success) return fail("invitation_not_found");
  const supabase = await createClient();
  const { data: schoolId, error } = await supabase.rpc("accept_invitation", { p_token: parsed.data });
  if (error) return fail(dbErrorCode(error));
  const { data: { user } } = await supabase.auth.getUser();
  await audit({ actorId: user?.id ?? null, schoolId, action: "invitation.accepted", entityType: "school", entityId: schoolId });
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function requestTeacherAccessAction(joinCode: string, message: string): Promise<ActionResult> {
  const parsed = z.object({ code: z.string().trim().min(4).max(20), message: z.string().max(1000) }).safeParse({ code: joinCode, message });
  if (!parsed.success) return fail("school_not_found");
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_teacher_access", { p_join_code: parsed.data.code, p_message: parsed.data.message });
  if (error) return fail(dbErrorCode(error));
  revalidatePath("/onboarding");
  return { ok: true, data: undefined };
}
