import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeUngradedAttempts } from "./grading-service";
import { notifyDeadlinesSoon } from "./notify";
import { logSystemError } from "./audit";

export type JobReport = { expired: number; graded: number; aiGraded: number; ocr: number; errors: string[] };

type Workers = {
  processGradingJobs?: (limit: number) => Promise<number>;
  processOcrJobs?: (limit: number) => Promise<number>;
};
const workers: Workers = {};

/** AI/OCR workers register themselves (keeps this module free of AI imports). */
export function registerWorkers(w: Workers) {
  Object.assign(workers, w);
}

/**
 * One pass of background work. Safe to run concurrently: attempts are finalized with
 * row locks and jobs are claimed with FOR UPDATE SKIP LOCKED.
 */
export async function runBackgroundJobs(limits: { grading: number; ocr: number }): Promise<JobReport> {
  const report: JobReport = { expired: 0, graded: 0, aiGraded: 0, ocr: 0, errors: [] };
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      report.errors.push(`${name}: ${msg}`);
      await logSystemError(`jobs.${name}`, msg);
    }
  };
  await import("./workers");
  await step("expire", async () => {
    const { data, error } = await createAdminClient().rpc("expire_overdue_attempts");
    if (error) throw new Error(error.message);
    report.expired = data ?? 0;
  });
  await step("grade", async () => {
    report.graded = await gradeUngradedAttempts(50);
  });
  if (limits.grading > 0 && workers.processGradingJobs) {
    await step("ai_grading", async () => {
      report.aiGraded = await workers.processGradingJobs!(limits.grading);
    });
  }
  if (limits.ocr > 0 && workers.processOcrJobs) {
    await step("ocr", async () => {
      report.ocr = await workers.processOcrJobs!(limits.ocr);
    });
  }
  await step("deadlines", notifyDeadlinesSoon);
  return report;
}
