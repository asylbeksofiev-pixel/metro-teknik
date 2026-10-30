import "server-only";
import { registerWorkers } from "./jobs";
import { processGradingJobs } from "@/lib/ai/grading-worker";
import { processOcrJobs } from "@/lib/ai/document-worker";

registerWorkers({ processGradingJobs, processOcrJobs });
