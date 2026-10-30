import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { loadAssessmentAnalytics } from "@/lib/data/assessment-analytics";
import { getI18n } from "@/lib/i18n/server";
import { toCsv } from "@/lib/analytics/stats";

/** CSV export of results per student and per question. RLS restricts to manageable assessments. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new NextResponse("Bad request", { status: 400 });
  const ctx = await getSessionContext();
  if (!ctx?.roles.some((r) => r === "teacher" || r === "school_admin")) return new NextResponse("Forbidden", { status: 403 });
  const { d } = await getI18n();
  const data = await loadAssessmentAnalytics(await createClient(), id);
  if (!data) return new NextResponse("Not found", { status: 404 });

  const rows: unknown[][] = [[d.common.student, d.grading.score, d.grading.maxScore, "%", d.live.submittedAt]];
  for (const s of data.students) rows.push([s.name, s.score, s.max, s.percent, s.submittedAt]);
  rows.push([]);
  rows.push([d.common.question, d.questions.type, d.questions.topic, d.questions.points, d.analytics.responses, d.analytics.correct, d.analytics.partial, d.analytics.incorrect, d.analytics.unanswered, d.analytics.accuracy, d.analytics.avgPoints]);
  for (const q of data.questions) {
    rows.push([q.index, d.questions.types[q.type], q.topic, q.maxPoints, q.stats.responses, q.stats.correct, q.stats.partial, q.stats.incorrect, q.stats.unanswered, q.stats.accuracy, q.stats.avgPoints]);
  }
  const name = `edusor-${data.title.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 60)}.csv`;
  return new NextResponse(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` },
  });
}
