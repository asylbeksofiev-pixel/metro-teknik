import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatDuration } from "@/lib/i18n/format";
import { loadAssessmentAnalytics } from "@/lib/data/assessment-analytics";
import { aiConfigured } from "@/lib/ai/client";
import { PageHeader, StatCard, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ColumnChart } from "@/components/charts/charts";
import { QuestionNavigator } from "@/components/analytics/question-navigator";
import { PrintButton } from "@/components/analytics/print-button";
import { fmt } from "@/lib/utils";

export default async function Analytics({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const data = await loadAssessmentAnalytics(supabase, id);
  if (!data) notFound();
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  return (
    <>
      <PageHeader
        title={fmt(d.analytics.title, { title: data.title })}
        breadcrumb={<Link href={`/teacher/assessments/${id}`} className="hover:underline no-print">{data.title}</Link>}
        description={<span className="print-only">{fmt(d.print.generatedAt, { date: formatDateTime(new Date(), locale) })}</span>}
        actions={
          <>
            <Button asChild variant="secondary" className="no-print"><a href={`/api/assessments/${id}/export`}><Download /> {d.analytics.exportCsv}</a></Button>
            <PrintButton label={d.analytics.printReport} />
          </>
        }
      />
      {data.participants === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface"><EmptyState title={d.analytics.noData} /></div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <StatCard label={d.analytics.participants} value={data.participants} />
            <StatCard label={d.analytics.submissionRate} value={data.assigned ? `${Math.round((data.participants / data.assigned) * 100)}%` : "—"} hint={`${data.participants}/${data.assigned}`} />
            <StatCard label={d.analytics.averageScore} value={pct(data.scores.avg)} hint={`${data.approved} ${d.grading.approved.toLowerCase()}`} />
            <StatCard label={d.analytics.medianScore} value={pct(data.scores.median)} />
            <StatCard label={d.analytics.minScore} value={pct(data.scores.min)} />
            <StatCard label={d.analytics.maxScore} value={pct(data.scores.max)} />
            <StatCard label={d.analytics.avgTime} value={data.avgSeconds === null ? "—" : formatDuration(data.avgSeconds)} />
            <StatCard label={d.assessment.questionCount} value={data.questions.length} />
          </div>
          <Card className="print-break">
            <CardHeader title={d.analytics.distribution} description={`% · ${d.common.students}`} />
            <CardBody><ColumnChart data={data.distribution.map((b) => ({ label: b.bucket, value: b.count }))} valueLabel={d.common.students} /></CardBody>
          </Card>
          <section>
            <h2 className="mb-3 text-[15px] font-semibold">{d.analytics.questionNavigator}</h2>
            <QuestionNavigator assessmentId={id} questions={data.questions} aiReady={aiConfigured()} />
          </section>
        </div>
      )}
    </>
  );
}
