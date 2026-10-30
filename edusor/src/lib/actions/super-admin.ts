"use server";

import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { audit } from "@/lib/server/audit";
import { publicEnv } from "@/lib/env";
import { pingAi } from "@/lib/ai/client";
import { fieldErrors } from "@/lib/validation/auth";
import { dbErrorCode, fail, type ActionResult } from "./result";

const schoolSchema = z.object({
  name: z.string().trim().min(2, "tooShort").max(200, "tooLong"),
  city: z.string().trim().max(100, "tooLong").optional(),
  region: z.string().trim().max(100, "tooLong").optional(),
});

export async function createSchoolAction(input: Record<string, string>): Promise<ActionResult> {
  const parsed = schoolSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const ctx = await requireRole("super_admin");
  const supabase = await createClient();
  const { data, error } = await supabase.from("schools").insert({ name: parsed.data.name, city: parsed.data.city || null, region: parsed.data.region || null }).select("id").single();
  if (error) return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId: data.id, action: "school.created", entityType: "school", entityId: data.id });
  revalidatePath("/super-admin/schools");
  return { ok: true, data: undefined };
}

export async function setSchoolActiveAction(schoolId: string, active: boolean): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(schoolId).success) return fail("invalid");
  const ctx = await requireRole("super_admin");
  const supabase = await createClient();
  const { error } = await supabase.from("schools").update({ is_active: active }).eq("id", schoolId);
  if (error) return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId, action: active ? "school.activated" : "school.deactivated", entityType: "school", entityId: schoolId });
  revalidatePath("/super-admin/schools");
  return { ok: true, data: undefined };
}

export async function inviteSchoolAdminAction(schoolId: string, email: string): Promise<ActionResult<{ link: string }>> {
  const p = z.object({ s: z.string().uuid(), e: z.string().trim().toLowerCase().email("email") }).safeParse({ s: schoolId, e: email });
  if (!p.success) return fail("validation", { email: "email" });
  const ctx = await requireRole("super_admin");
  const supabase = await createClient();
  const token = randomBytes(24).toString("base64url");
  const { error } = await supabase.from("invitations").insert({ school_id: p.data.s, email: p.data.e, role: "school_admin", token_hash: createHash("sha256").update(token).digest("hex"), invited_by: ctx.userId });
  if (error) return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId: p.data.s, action: "invitation.created", entityType: "school", entityId: p.data.s, metadata: { role: "school_admin" } });
  return { ok: true, data: { link: `${publicEnv.NEXT_PUBLIC_APP_URL}/register?invite=${token}` } };
}

export async function testAiAction(): Promise<ActionResult<{ ms: number }>> {
  await requireRole("super_admin");
  const res = await pingAi();
  return res.ok ? { ok: true, data: { ms: res.ms } } : fail(res.error ?? "aiFailed");
}
