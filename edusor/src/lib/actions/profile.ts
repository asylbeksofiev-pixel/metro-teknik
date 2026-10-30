"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE } from "@/lib/i18n/config";
import { fieldErrors } from "@/lib/validation/auth";
import { dbErrorCode, fail, type ActionResult } from "./result";

const profileSchema = z.object({
  fullName: z.string().trim().min(3, "tooShort").max(200, "tooLong"),
  locale: z.enum(["ru", "kk"]),
});

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("forbidden");
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.fullName, locale: parsed.data.locale }).eq("id", user.id);
  if (error) return fail(dbErrorCode(error));
  (await cookies()).set(LOCALE_COOKIE, parsed.data.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

const passwordSchema = z
  .object({ password: z.string().min(8, "minPassword").max(200, "tooLong"), passwordRepeat: z.string() })
  .refine((v) => v.password === v.passwordRepeat, { path: ["passwordRepeat"], message: "passwordsMismatch" });

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail("validation", { password: "invalid" });
  return { ok: true, data: undefined };
}
