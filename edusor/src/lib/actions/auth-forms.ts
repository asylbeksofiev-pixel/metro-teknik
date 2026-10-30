"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { forgotSchema, loginSchema, registerSchema, resetSchema, fieldErrors, LOGIN_RE } from "@/lib/validation/auth";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { fail, type ActionResult } from "./result";

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

export async function loginAction(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const { identifier, password, next } = parsed.data;

  const ip = await clientIp();
  if (!(await rateLimit(`login:${ip}`, 20, 300)) || !(await rateLimit(`login:${identifier.toLowerCase()}`, 10, 300))) {
    return fail("rateLimited");
  }

  const lower = identifier.toLowerCase();
  let email = lower;
  if (!lower.includes("@")) {
    if (!LOGIN_RE.test(lower)) return fail("invalidCredentials");
    email = `${lower}@${serverEnv().STUDENT_LOGIN_EMAIL_DOMAIN}`;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") return fail("emailNotConfirmed");
    return fail("invalidCredentials");
  }
  redirect(safeNext(next));
}

export async function registerAction(input: unknown, locale: string): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const { fullName, email, password, invite } = parsed.data;

  if (email.endsWith(`@${serverEnv().STUDENT_LOGIN_EMAIL_DOMAIN}`)) return fail("validation", { email: "email" });
  const ip = await clientIp();
  if (!(await rateLimit(`register:${ip}`, 5, 3600))) return fail("rateLimited");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, locale: locale === "kk" ? "kk" : "ru", pending_invite: invite || null },
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/app`,
    },
  });
  if (error) {
    if (error.code === "weak_password") return fail("validation", { password: "minPassword" });
    if (error.code === "over_email_send_rate_limit" || error.status === 429) return fail("rateLimited");
    return fail("generic");
  }
  if (data.session) redirect("/app");
  return { ok: true, data: { needsConfirmation: true } };
}

export async function forgotPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = forgotSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const ip = await clientIp();
  if (!(await rateLimit(`forgot:${ip}`, 5, 900))) return fail("rateLimited");
  const supabase = await createClient();
  // Always report success to avoid leaking which emails exist.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });
  return { ok: true, data: undefined };
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("forbidden");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(error.code === "same_password" ? "validation" : "generic", error.code === "same_password" ? { password: "invalid" } : undefined);
  return { ok: true, data: undefined };
}
