import { NextResponse } from "next/server";
import { z } from "zod";
import { attemptRouteContext, errorStatus } from "@/lib/server/attempt-route";
import { dbErrorCode } from "@/lib/actions/result";
import type { JsonObject } from "@/lib/supabase/types";

const body = z.object({
  questionId: z.string().uuid(),
  response: z.record(z.string(), z.unknown()),
  seq: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  flagged: z.boolean().optional(),
});

/** Autosave. The RPC enforces ownership, deadline (+10 s grace) and last-writer-wins by sequence. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await attemptRouteContext(params);
  if ("error" in ctx) return ctx.error;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { data, error } = await ctx.supabase.rpc("save_answer", {
    p_attempt: ctx.id,
    p_question: parsed.data.questionId,
    p_response: parsed.data.response as JsonObject,
    p_seq: parsed.data.seq,
    p_flagged: parsed.data.flagged,
  });
  if (error) {
    const code = dbErrorCode(error);
    return NextResponse.json({ error: code }, { status: errorStatus(code) });
  }
  return NextResponse.json(data);
}
