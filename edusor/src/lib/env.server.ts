import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  STUDENT_LOGIN_EMAIL_DOMAIN: z.string().min(3).default("students.edusor.local"),
  AI_API_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  AI_API_KEY: z.string().optional().default(""),
  AI_MODEL_TEXT: z.string().min(1).default("gpt-4.1-mini"),
  AI_MODEL_VISION: z.string().min(1).default("gpt-4.1-mini"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(60000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  CRON_SECRET: z.string().optional().default(""),
});

let cached: z.infer<typeof serverSchema> | null = null;

export function serverEnv() {
  cached ??= serverSchema.parse(process.env);
  return cached;
}
