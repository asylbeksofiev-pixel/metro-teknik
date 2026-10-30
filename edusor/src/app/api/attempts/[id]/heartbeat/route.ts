import { NextResponse } from "next/server";
import { z } from "zod";
import { attemptRouteContext, errorStatus } from "@/lib/server/attempt-route";
import { dbErrorCode } from "@/lib/actions/result";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await attemptRouteContext(params);
  if ("error" in ctx) return ctx.error;
  const parsed = z.object({ currentQuestionId: z.string().uuid().nullable().optional() }).safeParse(await request.json().catch(() => ({})));
  const { data, error } = await ctx.supabase.rpc("attempt_heartbeat", { p_attempt: ctx.id, p_current_question: parsed.success ? (parsed.data.currentQuestionId ?? undefined) : undefined });
  if (error) {
    const code = dbErrorCode(error);
    return NextResponse.json({ error: code }, { status: errorStatus(code) });
  }
  return NextResponse.json(data);
}
