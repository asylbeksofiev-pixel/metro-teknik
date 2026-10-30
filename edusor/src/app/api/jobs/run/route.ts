import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { runBackgroundJobs } from "@/lib/server/jobs";

export const maxDuration = 300;

/** Background job endpoint, called by Vercel Cron (Authorization: Bearer CRON_SECRET). */
async function handle(request: Request) {
  const secret = serverEnv().CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = await runBackgroundJobs({ grading: 20, ocr: 2 });
  return NextResponse.json(report);
}

export const GET = handle;
export const POST = handle;
