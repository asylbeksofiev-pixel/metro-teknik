import Link from "next/link";
import { Trophy } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, subjectName } from "@/lib/i18n/format";
import { markFromPercent } from "@/lib/assessment/grading";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatPoints } from "@/lib/utils";

export default async function StudentResults() {
  const ctx = await requireRole("student");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const [{ data: attempts }, { data: grades }, { data: releases }] = await Promise.all([
    supabase.from("attempts").select("id, submitted_at, grading_status, assessment:assessments(title, kind, subject:subjects(name_ru, name_kk))").eq("student_id", ctx.userId).eq("status", "submitted").order("submitted_at", { ascending: false }),
    supabase.from("final_grades").select("attempt_id, score, max_score, percent").eq("student_id", ctx.userId),
    supabase.from("result_releases").select("attempt_id"),
  ]);
  const gradeOf = new Map((grades ?? []).map((g) => [g.attempt_id, g]));
  const released = new Set((releases ?? []).map((r) => r.attempt_id));
  return (
    <>
      <PageHeader title={d.results.title} />
      <Card>
        <CardBody className="p-0">
          {!attempts?.length ? <EmptyState icon={Trophy} title={d.student.noResults} /> : (
            <Table>
              <THead><TR><TH>{d.assessment.title}</TH><TH>{d.common.subject}</TH><TH>{d.live.submittedAt}</TH><TH>{d.common.status}</TH><TH>{d.grading.score}</TH><TH /></TR></THead>
              <TBody>
                {attempts.map((t) => {
                  const g = released.has(t.id) ? gradeOf.get(t.id) : undefined;
                  return (
                    <TR key={t.id}>
                      <TD className="font-medium">{t.assessment?.title} {t.assessment && <Badge>{d.assessment.kind[t.assessment.kind]}</Badge>}</TD>
                      <TD>{subjectName(t.assessment?.subject, locale)}</TD>
                      <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(t.submitted_at, locale)}</TD>
                      <TD>
                        {released.has(t.id) ? <Badge tone="success">{d.results.released}</Badge> : t.grading_status === "graded" ? <Badge tone="info">{d.results.gradedNotReleased}</Badge> : <Badge>{d.results.pending}</Badge>}
                      </TD>
                      <TD className="tabular-nums">{g ? `${formatPoints(Number(g.score))} / ${formatPoints(Number(g.max_score))} · ${markFromPercent(Number(g.percent))}` : "—"}</TD>
                      <TD className="text-right">{g && <Link className="text-sm text-primary hover:underline" href={`/student/results/${t.id}`}>{d.common.open}</Link>}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}
