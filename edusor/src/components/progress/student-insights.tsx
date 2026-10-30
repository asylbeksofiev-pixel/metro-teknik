import type { Dictionary, Locale } from "@/lib/i18n/config";
import type { GradeRow, ScoreDetail } from "@/lib/data/progress";
import { summarizeStudent } from "@/lib/data/progress";
import { formatDate, subjectName } from "@/lib/i18n/format";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard, EmptyState } from "@/components/ui/misc";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PercentBars, TrendChart } from "@/components/charts/charts";
import { fmt, formatPoints } from "@/lib/utils";

/** Progress view shared by the student (own released data) and teachers (their students). */
export function StudentInsights({ grades, details, d, locale, resultHref, missing }: { grades: GradeRow[]; details: ScoreDetail[]; d: Dictionary; locale: Locale; resultHref: (attemptId: string) => string | null; missing?: { id: string; title: string; due: string | null }[] }) {
  const s = summarizeStudent(grades, details);
  if (!grades.length && !missing?.length) return <div className="rounded-lg border border-dashed border-border bg-surface"><EmptyState title={d.results.noMistakeData} /></div>;
  const feedback = [
    ...grades.filter((g) => g.feedback).map((g) => ({ date: g.date, title: g.title, text: g.feedback! })),
    ...details.filter((x) => x.feedback).map((x) => ({ date: x.date, title: grades.find((g) => g.attemptId === x.attemptId)?.title ?? "", text: x.feedback! })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={d.teacher.averageResult} value={s.average === null ? "—" : `${s.average}%`} />
        <StatCard label={d.teacher.assessmentsTaken} value={grades.length} />
        <StatCard label={d.analytics.improvement} value={s.trend === null ? "—" : `${s.trend > 0 ? "+" : ""}${s.trend}%`} tone={s.trend === null ? "primary" : s.trend >= 0 ? "success" : "warning"} />
      </div>
      {grades.length >= 2 && (
        <Card>
          <CardHeader title={d.analytics.scoreTrend} />
          <CardBody><TrendChart data={grades.map((g) => ({ label: formatDate(g.date, locale).slice(0, 6), value: Math.round(g.percent) }))} valueLabel={d.teacher.averageResult} /></CardBody>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={d.results.weakTopics} description={fmt(d.results.basedOn, { n: s.responses })} />
          <CardBody><PercentBars rows={s.weak.map((t) => ({ label: t.topic, percent: t.percent }))} empty={d.results.noMistakeData} /></CardBody>
        </Card>
        <Card>
          <CardHeader title={d.results.strongTopics} />
          <CardBody><PercentBars rows={s.strong.map((t) => ({ label: t.topic, percent: t.percent }))} empty={d.common.noData} /></CardBody>
        </Card>
        <Card>
          <CardHeader title={d.analytics.topicPerformance} />
          <CardBody><PercentBars rows={s.topics.map((t) => ({ label: t.topic, percent: t.percent, note: `(${t.responses})` }))} empty={d.common.noData} /></CardBody>
        </Card>
        <Card>
          <CardHeader title={d.results.mistakeTypes} />
          <CardBody className="flex flex-col gap-4">
            <PercentBars rows={s.mistakeTypes.map((t) => ({ label: d.questions.types[t.type], percent: t.percent, note: `(${t.responses})` }))} empty={d.common.noData} />
            {s.topicChange.length > 0 && (
              <div>
                <p className="mb-2 text-[13px] font-medium">{d.results.topicChanges}</p>
                <ul className="flex flex-col gap-1 text-sm">
                  {s.topicChange.map((t) => (
                    <li key={t.topic} className="flex justify-between gap-2"><span>{t.topic}</span><span className="tabular-nums">{t.before}% → {t.now}% <Badge tone={t.delta >= 0 ? "success" : "warning"}>{t.delta > 0 ? "+" : ""}{t.delta}</Badge></span></li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title={d.analytics.history} />
        <CardBody className="p-0">
          <Table>
            <THead><TR><TH>{d.assessment.title}</TH><TH>{d.common.subject}</TH><TH>{d.common.date}</TH><TH>{d.grading.score}</TH><TH>%</TH></TR></THead>
            <TBody>
              {[...grades].reverse().map((g) => {
                const href = resultHref(g.attemptId);
                return (
                  <TR key={g.attemptId}>
                    <TD className="font-medium">{href ? <a className="hover:text-primary hover:underline" href={href}>{g.title}</a> : g.title} <Badge>{d.assessment.kind[g.kind]}</Badge></TD>
                    <TD>{subjectName(g.subject, locale)}</TD>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDate(g.date, locale)}</TD>
                    <TD className="tabular-nums">{formatPoints(g.score)} / {formatPoints(g.max)}</TD>
                    <TD className="tabular-nums">{Math.round(g.percent)}%</TD>
                  </TR>
                );
              })}
              {missing?.map((m) => (
                <TR key={m.id}><TD className="font-medium">{m.title}</TD><TD /><TD className="text-muted-foreground">{formatDate(m.due, locale)}</TD><TD colSpan={2}><Badge tone="danger">{d.analytics.missing}</Badge></TD></TR>
              ))}
            </TBody>
          </Table>
        </CardBody>
      </Card>
      {feedback.length > 0 && (
        <Card>
          <CardHeader title={d.analytics.feedbackHistory} />
          <CardBody>
            <ul className="flex flex-col gap-3 text-sm">
              {feedback.map((f, i) => <li key={i}><p className="text-xs text-muted-foreground">{formatDate(f.date, locale)} · {f.title}</p><p>{f.text}</p></li>)}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
