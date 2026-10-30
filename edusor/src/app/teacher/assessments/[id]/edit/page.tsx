import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { isoToAlmatyLocal, subjectName } from "@/lib/i18n/format";
import { PageHeader, Alert } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssessmentSettingsForm } from "@/components/assessments/settings-form";
import { AssessmentBuilder, type BuilderQuestion } from "@/components/assessments/builder";
import { PublishButton } from "@/components/assessments/lifecycle-buttons";
import type { QuestionType, Rubric } from "@/lib/assessment/schema";

export default async function EditAssessment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data: a } = await supabase.from("assessments").select("*").eq("id", id).maybeSingle();
  if (!a) notFound();
  const [{ data: questions }, { data: sections }, { data: bank }, { data: subjects }] = await Promise.all([
    supabase.from("assessment_questions").select("*").eq("assessment_id", id).order("position"),
    supabase.from("assessment_sections").select("id, title, position").eq("assessment_id", id).order("position"),
    supabase.from("question_bank_items").select("id, type, content, topic, points, subject_id").eq("school_id", ctx.schoolId!).order("updated_at", { ascending: false }).limit(200),
    supabase.from("subjects").select("id, name_ru, name_kk").eq("school_id", ctx.schoolId!).order("name_ru"),
  ]);
  const builderQuestions: BuilderQuestion[] = (questions ?? []).map((q) => ({
    id: q.id,
    position: q.position,
    section_id: q.section_id,
    sectionId: q.section_id,
    type: q.type as QuestionType,
    content: q.content as Record<string, unknown>,
    answer_key: q.answer_key as Record<string, unknown>,
    rubric: q.rubric as Rubric | null,
    explanation: q.explanation,
    points: Number(q.points),
    topic: q.topic,
    learning_objective: q.learning_objective,
    reveal_after_release: q.reveal_after_release,
    ai_generated: q.ai_generated,
    ai_uncertain: q.ai_uncertain,
  }));
  const bankItems = (bank ?? [])
    .sort((x, y) => Number(y.subject_id === a.subject_id) - Number(x.subject_id === a.subject_id))
    .map((b) => ({ id: b.id, type: b.type as QuestionType, prompt: String((b.content as { prompt?: string }).prompt ?? ""), topic: b.topic, points: Number(b.points) }));

  return (
    <>
      <PageHeader
        title={a.title}
        breadcrumb={<><Link href="/teacher/assessments" className="hover:underline">{d.assessment.listTitle}</Link> / <Link href={`/teacher/assessments/${id}`} className="hover:underline">{d.common.view}</Link></>}
        actions={a.status !== "archived" ? <PublishButton assessmentId={id} republish={a.status !== "draft"} /> : undefined}
      />
      {a.status !== "draft" && <Alert tone="info" className="mb-4">{d.assessment.unpublishedChanges}</Alert>}
      <Tabs defaultValue="builder">
        <TabsList className="mb-4">
          <TabsTrigger value="builder">{d.assessment.builder}</TabsTrigger>
          <TabsTrigger value="settings">{d.assessment.settings}</TabsTrigger>
        </TabsList>
        <TabsContent value="builder">
          <AssessmentBuilder assessmentId={id} questions={builderQuestions} sections={sections ?? []} bank={bankItems} />
        </TabsContent>
        <TabsContent value="settings">
          <Card>
            <CardHeader title={d.assessment.settings} />
            <CardBody>
              <AssessmentSettingsForm
                assessmentId={id}
                subjects={(subjects ?? []).map((s) => ({ id: s.id, name: subjectName(s, locale) }))}
                initial={{
                  title: a.title,
                  kind: a.kind,
                  subjectId: a.subject_id,
                  grade: a.grade,
                  instructions: a.instructions ?? "",
                  startsAt: isoToAlmatyLocal(a.starts_at),
                  dueAt: isoToAlmatyLocal(a.due_at),
                  durationMinutes: a.duration_minutes,
                  maxAttempts: a.max_attempts,
                  shuffleQuestions: a.shuffle_questions,
                  shuffleOptions: a.shuffle_options,
                  allowNavigation: a.allow_navigation,
                  lockdownMode: a.lockdown_mode,
                  releaseMode: a.release_mode,
                  showCorrectAnswers: a.show_correct_answers,
                  allowAiExplanations: a.allow_ai_explanations,
                  allowAiFollowup: a.allow_ai_followup,
                  allowPractice: a.allow_practice,
                  gradingProfile: a.grading_profile,
                }}
              />
            </CardBody>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
