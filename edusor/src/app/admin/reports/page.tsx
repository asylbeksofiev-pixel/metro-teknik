import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { subjectName } from "@/lib/i18n/format";
import { mean, round1 } from "@/lib/analytics/stats";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PercentBars } from "@/components/charts/charts";
import { PrintButton } from "@/components/analytics/print-button";

export default async function AdminReports() {
  const ctx = await requireRole("school_admin");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data: grades } = await supabase
    .from("final_grades")
    .select("percent, assessment:assessments!inner(school_id, kind, class:classes(name), subject:subjects(id, name_ru, name_kk))")
    .eq("assessment.school_id", ctx.schoolId!);
  const group = (key: (g: NonNullable<typeof grades>[number]) => string | null) => {
    const m = new Map<string, number[]>();
    for (const g of grades ?? []) {
      const k = key(g);
      if (k) m.set(k, [...(m.get(k) ?? []), Number(g.percent)]);
    }
    return [...m.entries()].map(([label, v]) => ({ label, n: v.length, avg: round1(mean(v))!, below: v.filter((x) => x < 40).length })).sort((a, b) => a.label.localeCompare(b.label));
  };
  const byClass = group((g) => g.assessment?.class?.name ?? null);
  const bySubject = group((g) => (g.assessment?.subject ? subjectName(g.assessment.subject, locale) : null));
  const table = (rows: typeof byClass, head: string) => (
    <Table>
      <THead><TR><TH>{head}</TH><TH>{d.admin.gradedCount}</TH><TH>{d.common.average}</TH><TH>&lt; 40%</TH></TR></THead>
      <TBody>{rows.map((r) => <TR key={r.label}><TD className="font-medium">{r.label}</TD><TD className="tabular-nums">{r.n}</TD><TD className="tabular-nums">{r.avg}%</TD><TD className="tabular-nums">{r.below}</TD></TR>)}</TBody>
    </Table>
  );
  return (
    <>
      <PageHeader title={d.admin.reportsTitle} actions={<PrintButton label={d.analytics.printReport} />} />
      {!grades?.length ? <div className="rounded-lg border border-dashed border-border bg-surface"><EmptyState title={d.analytics.noData} /></div> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader title={d.admin.reportsByClass} /><CardBody className="flex flex-col gap-4"><PercentBars rows={byClass.map((r) => ({ label: r.label, percent: r.avg }))} empty={d.common.noData} />{table(byClass, d.common.class)}</CardBody></Card>
          <Card><CardHeader title={d.admin.reportsBySubject} /><CardBody className="flex flex-col gap-4"><PercentBars rows={bySubject.map((r) => ({ label: r.label, percent: r.avg }))} empty={d.common.noData} />{table(bySubject, d.common.subject)}</CardBody></Card>
        </div>
      )}
    </>
  );
}
