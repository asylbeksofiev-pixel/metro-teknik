import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { loadStudentResult } from "@/lib/data/student-result";
import { markFromPercent } from "@/lib/assessment/grading";
import { PageHeader, Alert, ProgressBar } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatPoints } from "@/lib/utils";

const TONE = { correct: "success", incorrect: "danger", partial: "warning", unanswered: "neutral", pending: "info" } as const;

export default async function StudentResult({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("student");
  const { d } = await getI18n();
  const supabase = await createClient();
  const r = await loadStudentResult(supabase, ctx.userId, id);
  if (!r) notFound();
  if (!r.released) {
    return (
      <>
        <PageHeader title={r.attempt.assessment!.title} breadcrumb={<Link href="/student/results" className="hover:underline">{d.results.title}</Link>} />
        <Alert tone="info">{d.results.notAvailable}</Alert>
      </>
    );
  }
  const pct = Number(r.grade?.percent ?? 0);
  return (
    <>
      <PageHeader
        title={r.attempt.assessment!.title}
        breadcrumb={<Link href="/student/results" className="hover:underline">{d.results.title}</Link>}
        actions={<Button asChild><Link href={`/student/results/${id}/review`}>{d.results.reviewMistakes}</Link></Button>}
      />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="self-start">
          <CardHeader title={d.results.yourScore} />
          <CardBody className="flex flex-col gap-3">
            <p className="text-3xl font-semibold tabular-nums">{formatPoints(Number(r.grade?.score))} <span className="text-lg text-muted-foreground">/ {formatPoints(Number(r.grade?.max_score))}</span></p>
            <ProgressBar value={pct} tone={pct >= 65 ? "success" : pct >= 40 ? "warning" : "danger"} />
            <p className="text-sm text-muted-foreground">{Math.round(pct)}% · {d.grading.mark}: <b className="text-foreground">{markFromPercent(pct)}</b></p>
            {r.grade?.feedback && (
              <div className="rounded-md bg-muted/60 p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{d.results.teacherComment}</p>
                {r.grade.feedback}
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-0">
            <Table>
              <THead><TR><TH>№</TH><TH>{d.questions.type}</TH><TH>{d.questions.topic}</TH><TH>{d.common.status}</TH><TH>{d.results.awarded}</TH></TR></THead>
              <TBody>
                {r.items.map((it) => (
                  <TR key={it.questionId}>
                    <TD>{it.index}</TD>
                    <TD>{d.questions.types[it.type]}</TD>
                    <TD className="text-muted-foreground">{it.topic ?? "—"}</TD>
                    <TD><Badge tone={TONE[it.result as keyof typeof TONE] ?? "neutral"}>{(d.grading.results as Record<string, string>)[it.result]}</Badge></TD>
                    <TD className="tabular-nums">{formatPoints(it.points)} / {formatPoints(it.max)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
