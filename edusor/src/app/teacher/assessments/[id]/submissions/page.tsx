import Link from "next/link";
import { notFound } from "next/navigation";
import { Inbox } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/i18n/format";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/forms/action-button";
import { approveAllAutoAction, releaseResultsAction } from "@/lib/actions/grading";
import { markFromPercent } from "@/lib/assessment/grading";
import { fmt, formatPoints } from "@/lib/utils";

export default async function Submissions({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data: a } = await supabase.from("assessments").select("id, title, release_mode").eq("id", id).maybeSingle();
  if (!a) notFound();
  const [{ data: attempts }, { data: grades }, { data: releases }] = await Promise.all([
    supabase.from("attempts").select("id, attempt_no, submitted_at, submit_reason, grading_status, lockdown_event_count, student:profiles(full_name), question_scores(auto_points, final_points, max_points, needs_review)").eq("assessment_id", id).eq("status", "submitted").order("submitted_at", { ascending: false }),
    supabase.from("final_grades").select("attempt_id, score, max_score, percent").eq("assessment_id", id),
    supabase.from("result_releases").select("attempt_id").eq("assessment_id", id),
  ]);
  const gradeOf = new Map((grades ?? []).map((g) => [g.attempt_id, g]));
  const released = new Set((releases ?? []).map((r) => r.attempt_id));
  const pendingAuto = (attempts ?? []).filter((t) => t.grading_status === "pending").length;
  const releasable = (grades ?? []).filter((g) => !released.has(g.attempt_id)).length;

  return (
    <>
      <PageHeader
        title={fmt(d.grading.submissionsTitle, { title: a.title })}
        breadcrumb={<Link href={`/teacher/assessments/${id}`} className="hover:underline">{a.title}</Link>}
        actions={
          <>
            <ActionButton action={approveAllAutoAction.bind(null, id)} disabled={!pendingAuto} confirm={{ title: d.grading.approveAllAuto, description: d.grading.approveAllConfirm }}>{d.grading.approveAllAuto} ({pendingAuto})</ActionButton>
            <ActionButton variant="primary" action={releaseResultsAction.bind(null, id, undefined)} disabled={!releasable} confirm={{ title: d.grading.releaseAll, description: d.grading.releaseConfirm }}>{d.grading.releaseAll} ({releasable})</ActionButton>
          </>
        }
      />
      <Card>
        <CardHeader title={`${d.assessment.submissions} (${attempts?.length ?? 0})`} />
        <CardBody className="p-0">
          {!attempts?.length ? <EmptyState icon={Inbox} title={d.grading.noSubmissions} /> : (
            <Table>
              <THead><TR><TH>{d.common.student}</TH><TH>{d.live.submittedAt}</TH><TH>{d.grading.autoScore}</TH><TH>{d.grading.finalScore}</TH><TH>{d.grading.mark}</TH><TH>{d.common.status}</TH><TH>{d.lockdown.eventLog}</TH><TH /></TR></THead>
              <TBody>
                {attempts.map((t) => {
                  const g = gradeOf.get(t.id);
                  const auto = t.question_scores.reduce((s, q) => s + Number(q.final_points ?? q.auto_points ?? 0), 0);
                  const max = t.question_scores.reduce((s, q) => s + Number(q.max_points), 0);
                  const review = t.question_scores.filter((q) => q.final_points === null).length;
                  return (
                    <TR key={t.id}>
                      <TD className="font-medium">{t.student?.full_name}{t.attempt_no > 1 && <span className="ml-1 text-xs text-muted-foreground">({fmt(d.grading.attempt, { n: t.attempt_no })})</span>}</TD>
                      <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(t.submitted_at, locale)}{t.submit_reason === "timeout" && <Badge tone="warning" className="ml-1">{d.live.expired}</Badge>}</TD>
                      <TD className="tabular-nums">{formatPoints(auto)} / {formatPoints(max)}</TD>
                      <TD className="tabular-nums font-medium">{g ? `${formatPoints(Number(g.score))} / ${formatPoints(Number(g.max_score))} (${Math.round(Number(g.percent))}%)` : "—"}</TD>
                      <TD>{g ? markFromPercent(Number(g.percent)) : "—"}</TD>
                      <TD>
                        {released.has(t.id) ? <Badge tone="success">{d.grading.released}</Badge>
                          : t.grading_status === "graded" ? <Badge tone="info">{d.grading.gradedNotReleased}</Badge>
                          : review ? <Badge tone="warning">{fmt(d.grading.needsReviewCount, { n: review })}</Badge>
                          : <Badge>{d.grading.pendingReview}</Badge>}
                      </TD>
                      <TD>{t.lockdown_event_count > 0 ? <Badge tone="warning">{t.lockdown_event_count}</Badge> : "0"}</TD>
                      <TD className="text-right"><Button asChild size="sm" variant={review ? "primary" : "secondary"}><Link href={`/teacher/submissions/${t.id}/review`}>{d.grading.review}</Link></Button></TD>
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
