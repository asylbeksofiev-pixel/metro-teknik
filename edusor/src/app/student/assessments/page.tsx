import { ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { studentAssessments } from "@/lib/data/student";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { StudentAssessmentCard } from "@/components/student/assessment-card";
import { UrlSelect } from "@/components/forms/url-select";

const GROUPS = ["available", "in_progress", "upcoming", "submitted", "under_review", "graded", "released", "expired"] as const;

export default async function StudentAssessments({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const ctx = await requireRole("student");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const rows = (await studentAssessments(supabase, ctx.userId)).filter((r) => !status || r.status === status);
  return (
    <>
      <PageHeader title={d.student.assessmentsTitle} actions={<UrlSelect param="status" label={d.common.status} allLabel={d.common.all} options={GROUPS.map((g) => ({ value: g, label: d.status[g] }))} />} />
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface"><EmptyState icon={ClipboardList} title={d.student.noAssessments} /></div>
      ) : (
        <div className="flex flex-col gap-3">{rows.map((a) => <StudentAssessmentCard key={a.id} a={a} d={d} locale={locale} />)}</div>
      )}
    </>
  );
}
