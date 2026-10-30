import { z } from "zod";

// Messages are dictionary keys under `validation.*`; the UI translates them.
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "required").max(200, "tooLong"),
  password: z.string().min(1, "required").max(200, "tooLong"),
  next: z.string().optional(),
});

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(3, "tooShort").max(200, "tooLong"),
    email: z.string().trim().toLowerCase().email("email"),
    password: z.string().min(8, "minPassword").max(200, "tooLong"),
    passwordRepeat: z.string(),
    invite: z.string().max(200).optional(),
  })
  .refine((v) => v.password === v.passwordRepeat, { path: ["passwordRepeat"], message: "passwordsMismatch" });

export const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email("email") });

export const resetSchema = z
  .object({ password: z.string().min(8, "minPassword").max(200, "tooLong"), passwordRepeat: z.string() })
  .refine((v) => v.password === v.passwordRepeat, { path: ["passwordRepeat"], message: "passwordsMismatch" });

export const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,40}$/;

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
