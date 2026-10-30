import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { loadPerformance } from "@/lib/data/progress";
import { PageHeader } from "@/components/ui/misc";
import { StudentInsights } from "@/components/progress/student-insights";

export default async function StudentProgress() {
  const ctx = await requireRole("student");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  // RLS returns only this student's released grades and scores.
  const { grades, details } = await loadPerformance(supabase, { studentIds: [ctx.userId] });
  return (
    <>
      <PageHeader title={d.student.progressTitle} description={d.results.mistakesTitle} />
      <StudentInsights grades={grades} details={details} d={d} locale={locale} resultHref={(id) => `/student/results/${id}`} />
    </>
  );
}
