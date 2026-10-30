import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { teacherClasses } from "@/lib/data/teacher";
import { subjectName } from "@/lib/i18n/format";
import { validateQuestion } from "@/lib/assessment/schema";
import type { DocumentResult } from "@/lib/ai/document-worker";
import { PageHeader, Alert } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/content/rich-text";
import { SimpleForm } from "@/components/forms/simple-form";
import { ActionButton } from "@/components/forms/action-button";
import { AutoRefresh } from "@/components/documents/auto-refresh";
import { createAssessmentFromDocumentAction, retryDocumentAction } from "@/lib/actions/documents";
import { fmt, formatPoints } from "@/lib/utils";

const STEPS = ["uploaded", "extracting_text", "generating_questions", "review_required", "completed"] as const;

export default async function DocumentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data: job } = await supabase.from("ocr_jobs").select("*").eq("id", id).maybeSingle();
  if (!job) notFound();
  const [{ data: pages }, classes, { data: subjects }] = await Promise.all([
    supabase.from("ocr_transcriptions").select("page, method, text, uncertain, notes").eq("job_id", id).order("page"),
    teacherClasses(supabase, ctx.userId),
    supabase.from("subjects").select("id, name_ru, name_kk").eq("school_id", ctx.schoolId!).order("name_ru"),
  ]);
  const running = ["uploaded", "processing", "extracting_text", "generating_questions"].includes(job.status);
  const result = job.result as unknown as DocumentResult | null;
  const uncertain = (pages ?? []).filter((p) => p.uncertain).length + (result?.questions.filter((q) => q.uncertain).length ?? 0);
  const step = job.status === "processing" ? 0 : STEPS.indexOf(job.status as (typeof STEPS)[number]);

  return (
    <>
      <PageHeader
        title={job.file_name}
        breadcrumb={<Link href="/teacher/documents" className="hover:underline">{d.documents.title}</Link>}
        actions={<Button asChild variant="secondary"><a href={`/api/documents/${id}/original`} target="_blank" rel="noopener noreferrer"><ExternalLink /> {d.documents.original}</a></Button>}
      />
      <AutoRefresh active={running} />

      <ol className="mb-6 flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${job.status === "failed" ? "bg-muted text-muted-foreground" : i < step ? "bg-success-soft text-success" : i === step ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground"}`}>
            {i === step && running && <Loader2 className="size-3 animate-spin" />}
            {d.documents.statuses[s]}
          </li>
        ))}
        {job.status === "failed" && <li className="rounded-full bg-danger-soft px-3 py-1 text-xs font-medium text-danger">{d.documents.statuses.failed}</li>}
      </ol>

      {running && <Alert tone="info" className="mb-6">{d.documents.processingHint}</Alert>}
      {job.status === "failed" && (
        <Alert tone="danger" className="mb-6" title={d.documents.statuses.failed}>
          <p className="mt-1 font-mono text-xs">{job.last_error}</p>
          <div className="mt-3"><ActionButton action={retryDocumentAction.bind(null, id)}>{d.documents.retry}</ActionButton></div>
        </Alert>
      )}

      {result && (
        <div className="mb-6 flex flex-col gap-3">
          {result.codes.map((c) => <Alert key={c} tone="warning">{d.documents.codes[c]}</Alert>)}
          {result.warnings.length > 0 && <Alert tone="warning" title={d.documents.warnings}><ul className="mt-1 list-disc pl-4">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Alert>}
          {uncertain > 0 && <Alert tone="warning">{fmt(d.documents.uncertainCount, { n: uncertain })}</Alert>}
        </div>
      )}

      {job.status === "review_required" && result && (
        <Card className="mb-6">
          <CardHeader title={d.documents.createAssessment} description={d.documents.reviewNote} />
          <CardBody>
            <SimpleForm
              action={async (v) => { "use server"; return createAssessmentFromDocumentAction(id, v); }}
              submitLabel={d.documents.createAssessment}
              columns={2}
              fields={[
                { name: "title", label: d.documents.titleHint, required: true, maxLength: 200, defaultValue: result.title ?? job.file_name.replace(/\.[^.]+$/, "") },
                { name: "kind", label: d.assessment.kindLabel, type: "select", required: true, options: [{ value: "sor", label: d.assessment.kind.sor }, { value: "soch", label: d.assessment.kind.soch }] },
                { name: "classId", label: d.common.class, type: "select", options: classes.map((c) => ({ value: c.id, label: c.name })) },
                { name: "subjectId", label: d.common.subject, type: "select", options: (subjects ?? []).map((s) => ({ value: s.id, label: subjectName(s, locale) })) },
              ]}
            />
          </CardBody>
        </Card>
      )}
      {job.status === "completed" && job.assessment_id && (
        <Alert tone="success" className="mb-6"><Link className="underline" href={`/teacher/assessments/${job.assessment_id}/edit`}>{d.assessment.builder}</Link></Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={d.documents.extracted} description={job.page_count ? fmt(d.documents.pages, { n: job.page_count }) : undefined} />
          <CardBody className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
            {!pages?.length ? <p className="text-sm text-muted-foreground">{running ? d.common.loading : d.common.noData}</p> : pages.map((p) => (
              <section key={p.page} className="rounded-md border border-border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium">#{p.page}</span>
                  <Badge>{p.method === "vision_ocr" ? "OCR" : p.method.toUpperCase()}</Badge>
                  {p.uncertain && <Badge tone="warning"><AlertTriangle className="size-3" /> {d.questions.uncertain}</Badge>}
                </div>
                <RichText text={p.text} className="text-sm" />
                {p.notes && <p className="mt-2 text-xs text-muted-foreground">{p.notes}</p>}
              </section>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={d.documents.generated} description={result ? fmt(d.documents.questionsFound, { n: result.questions.length }) : undefined} />
          <CardBody className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
            {!result?.questions.length ? <p className="text-sm text-muted-foreground">{running ? d.common.loading : d.common.noData}</p> : result.questions.map((q, i) => {
              const problem = validateQuestion(q);
              return (
                <div key={i} className="rounded-md border border-border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold">{i + 1}.</span>
                    <Badge tone="primary">{d.questions.types[q.type]}</Badge>
                    <Badge>{formatPoints(q.points)} {d.common.pointsShort}</Badge>
                    <Badge tone="info"><Sparkles className="size-3" /> {d.common.aiGenerated}</Badge>
                    {q.uncertain && <Badge tone="warning">{d.questions.uncertain}</Badge>}
                    {problem && <Badge tone="warning">{problem === "correct" || problem === "accepted" || problem === "numeric" || problem === "items" || problem === "pairs" || problem === "blanks" ? d.documents.noKey : (d.questions.validation as Record<string, string>)[problem]}</Badge>}
                  </div>
                  <RichText text={String(q.content.prompt ?? "")} className="text-sm" />
                  {q.note && <p className="mt-1 text-xs text-warning">{q.note}</p>}
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
