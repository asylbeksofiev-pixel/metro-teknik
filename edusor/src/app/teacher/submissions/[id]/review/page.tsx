import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatDuration } from "@/lib/i18n/format";
import { describeKey } from "@/lib/assessment/describe";
import type { QuestionType, Rubric, SnapshotQuestion } from "@/lib/assessment/schema";
import { aiConfigured } from "@/lib/ai/client";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QuestionReviewCard, type ReviewItem } from "@/components/grading/question-review-card";
import { ApprovePanel } from "@/components/grading/approve-panel";
import { AutoRefresh } from "@/components/documents/auto-refresh";
import { fmt } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReviewDesk({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("attempts")
    .select("*, student:profiles(full_name, login, email), assessment:assessments(id, title, release_mode)")
    .eq("id", id)
    .maybeSingle();
  if (!t || !t.assessment || t.status !== "submitted") notFound();

  const [{ data: snap }, { data: keys }, { data: answers }, { data: scores }, { data: files }, { data: grade }, { data: release }, { data: events }] = await Promise.all([
    supabase.from("assessment_snapshots").select("questions").eq("id", t.snapshot_id).single(),
    supabase.from("assessment_snapshot_keys").select("question_id, answer_key, rubric, explanation").eq("snapshot_id", t.snapshot_id),
    supabase.from("answers").select("id, question_id, response").eq("attempt_id", id),
    supabase.from("question_scores").select("*").eq("attempt_id", id),
    supabase.from("submission_files").select("id, question_id, file_name, storage_path").eq("attempt_id", id),
    supabase.from("final_grades").select("score, max_score, feedback").eq("attempt_id", id).maybeSingle(),
    supabase.from("result_releases").select("released_at").eq("attempt_id", id).maybeSingle(),
    supabase.from("lockdown_events").select("event_type, occurred_at, duration_ms").eq("attempt_id", id).order("occurred_at"),
  ]);
  const answerIds = (answers ?? []).map((a) => a.id);
  const fileIds = (files ?? []).map((f) => f.id);
  const [{ data: suggestions }, { data: jobs }, { data: history }, { data: transcripts }] = await Promise.all([
    answerIds.length ? supabase.from("grading_suggestions").select("id, answer_id, suggested_score, explanation, feedback, confidence, needs_manual_review, created_at, criterion_scores(criterion_id, title, score, max_score, comment)").in("answer_id", answerIds).order("created_at", { ascending: false }) : { data: [] },
    answerIds.length ? supabase.from("grading_jobs").select("answer_id, status, last_error, created_at").in("answer_id", answerIds).order("created_at", { ascending: false }) : { data: [] },
    answerIds.length ? supabase.from("teacher_reviews").select("answer_id, source, points, previous_points, created_at, reviewer:profiles(full_name)").in("answer_id", answerIds).order("created_at", { ascending: false }) : { data: [] },
    fileIds.length ? supabase.from("ocr_transcriptions").select("submission_file_id, page, text").in("submission_file_id", fileIds).order("page") : { data: [] },
  ]);

  const signed = new Map<string, string | null>();
  for (const f of files ?? []) signed.set(f.id, (await supabase.storage.from("submissions").createSignedUrl(f.storage_path, 600)).data?.signedUrl ?? null);

  const byQ = new Map(((snap?.questions ?? []) as SnapshotQuestion[]).map((q) => [q.id, q]));
  const keyOf = new Map((keys ?? []).map((k) => [k.question_id, k]));
  const answerOf = new Map((answers ?? []).map((a) => [a.question_id, a]));
  const scoreOf = new Map((scores ?? []).map((s) => [s.answer_id, s]));
  // Present questions in the assessment's canonical order (not the student's shuffled order).
  const ordered = ((snap?.questions ?? []) as SnapshotQuestion[]).map((q) => q.id).filter((qid) => t.question_order.includes(qid));
  const items: ReviewItem[] = ordered.flatMap((qid, i) => {
    const q = byQ.get(qid);
    const a = answerOf.get(qid);
    const s = a ? scoreOf.get(a.id) : undefined;
    if (!q || !a || !s) return [];
    const k = keyOf.get(qid);
    const sug = (suggestions ?? []).find((x) => x.answer_id === a.id);
    const job = (jobs ?? []).find((j) => j.answer_id === a.id);
    const qFiles = (files ?? []).filter((f) => f.question_id === qid);
    const tr = (transcripts ?? []).filter((x) => qFiles.some((f) => f.id === x.submission_file_id)).map((x) => x.text).join("\n\n");
    return [{
      answerId: a.id,
      index: i + 1,
      type: q.type as QuestionType,
      content: q.content,
      response: a.response as Record<string, unknown>,
      maxPoints: Number(s.max_points),
      autoPoints: s.auto_points === null ? null : Number(s.auto_points),
      autoResult: s.auto_result,
      finalPoints: s.final_points === null ? null : Number(s.final_points),
      teacherFeedback: s.teacher_feedback,
      correctAnswer: k ? describeKey(q.type as QuestionType, q.content, k.answer_key, d.questions.trueLabel, d.questions.falseLabel) : null,
      explanation: k?.explanation ?? null,
      rubric: (k?.rubric as Rubric | null) ?? null,
      files: qFiles.map((f) => ({ name: f.file_name, url: signed.get(f.id) ?? null })),
      transcription: tr || null,
      suggestion: sug ? { id: sug.id, score: Number(sug.suggested_score), explanation: sug.explanation, feedback: sug.feedback, confidence: Number(sug.confidence), needsReview: sug.needs_manual_review, createdAt: sug.created_at, criteria: sug.criterion_scores.map((c) => ({ criterionId: c.criterion_id, title: c.title, score: Number(c.score), max: Number(c.max_score), comment: c.comment })) } : null,
      job: job ? { status: job.status, error: job.last_error } : null,
      history: (history ?? []).filter((h) => h.answer_id === a.id).map((h) => ({ source: h.source, points: Number(h.points), previous: h.previous_points === null ? null : Number(h.previous_points), at: h.created_at, reviewer: h.reviewer?.full_name ?? null })),
    }];
  });
  const openCount = items.filter((x) => x.finalPoints === null).length;
  const total = items.reduce((s, x) => s + (x.finalPoints ?? 0), 0);
  const max = items.reduce((s, x) => s + x.maxPoints, 0);
  const aiRunning = items.some((x) => x.job && (x.job.status === "queued" || x.job.status === "running"));
  const seconds = t.submitted_at ? (new Date(t.submitted_at).getTime() - new Date(t.started_at).getTime()) / 1000 : null;

  return (
    <>
      <AutoRefresh active={aiRunning} intervalMs={4000} />
      <PageHeader
        title={`${d.grading.reviewTitle}: ${t.student?.full_name ?? ""}`}
        breadcrumb={<><Link href={`/teacher/assessments/${t.assessment.id}/submissions`} className="hover:underline">{t.assessment.title}</Link></>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {t.student?.login ?? t.student?.email}
            · {d.live.startedAt}: {formatDateTime(t.started_at, locale)}
            · {d.live.submittedAt}: {formatDateTime(t.submitted_at, locale)}{seconds !== null && ` (${formatDuration(seconds)})`}
            {t.submit_reason === "timeout" && <Badge tone="warning">{d.live.expired}</Badge>}
            {t.attempt_no > 1 && <Badge>{fmt(d.grading.attempt, { n: t.attempt_no })}</Badge>}
          </span>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          {items.map((item) => <QuestionReviewCard key={item.answerId} item={item} aiReady={aiConfigured()} />)}
        </div>
        <div className="flex flex-col gap-4 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader title={d.grading.approve} />
            <CardBody>
              <ApprovePanel attemptId={id} assessmentId={t.assessment.id} openCount={openCount} total={total} max={max} approved={!!grade} released={!!release} feedback={grade?.feedback ?? null} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={d.lockdown.eventLog} description={d.lockdown.eventsNote} />
            <CardBody className="max-h-80 overflow-y-auto">
              {!events?.length ? <p className="text-sm text-muted-foreground">{d.lockdown.noEvents}</p> : (
                <ul className="flex flex-col gap-1.5 text-[13px]">
                  {events.map((e, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{(d.lockdown.events as Record<string, string>)[e.event_type] ?? e.event_type}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{e.duration_ms !== null && `${formatDuration(e.duration_ms / 1000)} · `}{new Date(e.occurred_at).toLocaleTimeString(locale === "kk" ? "kk-KZ" : "ru-RU", { timeZone: "Asia/Almaty" })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
