import { NextResponse, after } from "next/server";
import { attemptRouteContext, errorStatus } from "@/lib/server/attempt-route";
import { dbErrorCode } from "@/lib/actions/result";
import { gradeAttempt } from "@/lib/server/grading-service";
import { logSystemError } from "@/lib/server/audit";
import { runBackgroundJobs } from "@/lib/server/jobs";

/**
 * Final submission. Idempotent: a repeated call returns the original submission time.
 * Grading runs only after the RPC has confirmed (as the student) that the attempt is theirs.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await attemptRouteContext(params);
  if ("error" in ctx) return ctx.error;
  const { data, error } = await ctx.supabase.rpc("submit_attempt", { p_attempt: ctx.id });
  if (error) {
    const code = dbErrorCode(error);
    return NextResponse.json({ error: code }, { status: errorStatus(code) });
  }
  try {
    await gradeAttempt(ctx.id);
  } catch (e) {
    // The submission itself is safe; the job runner retries grading later.
    await logSystemError("submit.grading", e instanceof Error ? e.message : String(e), { attemptId: ctx.id });
  }
  after(() => runBackgroundJobs({ grading: 5, ocr: 0 }));
  return NextResponse.json(data);
}
