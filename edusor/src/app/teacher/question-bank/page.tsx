import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { subjectName } from "@/lib/i18n/format";
import { QUESTION_TYPES, type QuestionType, type Rubric } from "@/lib/assessment/schema";
import { PageHeader } from "@/components/ui/misc";
import { SearchInput } from "@/components/forms/search-input";
import { UrlSelect } from "@/components/forms/url-select";
import { BankManager, type BankRow } from "@/components/questions/bank-manager";

type SP = { q?: string; subject?: string; grade?: string; difficulty?: string; type?: string; topic?: string };

export default async function QuestionBank({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  let query = supabase.from("question_bank_items").select("*, subject:subjects(name_ru, name_kk)").eq("school_id", ctx.schoolId!).order("updated_at", { ascending: false }).limit(300);
  if (sp.subject) query = query.eq("subject_id", sp.subject);
  if (sp.grade && /^\d+$/.test(sp.grade)) query = query.eq("grade", Number(sp.grade));
  if (sp.difficulty === "easy" || sp.difficulty === "medium" || sp.difficulty === "hard") query = query.eq("difficulty", sp.difficulty);
  if (sp.type && (QUESTION_TYPES as readonly string[]).includes(sp.type)) query = query.eq("type", sp.type as QuestionType);
  if (sp.topic) query = query.eq("topic", sp.topic);
  const [{ data: items }, { data: subjects }, { data: drafts }, { data: topics }] = await Promise.all([
    query,
    supabase.from("subjects").select("id, name_ru, name_kk").eq("school_id", ctx.schoolId!).order("name_ru"),
    supabase.from("assessments").select("id, title").eq("status", "draft").eq("created_by", ctx.userId).order("updated_at", { ascending: false }),
    supabase.from("question_bank_items").select("topic").eq("school_id", ctx.schoolId!).not("topic", "is", null),
  ]);
  const needle = sp.q?.trim().toLowerCase();
  const rows: BankRow[] = (items ?? [])
    .filter((i) => !needle || JSON.stringify(i.content).toLowerCase().includes(needle) || i.topic?.toLowerCase().includes(needle))
    .map((i) => ({
      id: i.id,
      type: i.type as QuestionType,
      content: i.content as Record<string, unknown>,
      answer_key: i.answer_key as Record<string, unknown>,
      rubric: i.rubric as Rubric | null,
      explanation: i.explanation,
      points: Number(i.points),
      topic: i.topic,
      learning_objective: i.learning_objective,
      subject_id: i.subject_id,
      subject_name: i.subject ? subjectName(i.subject, locale) : "",
      grade: i.grade,
      difficulty: i.difficulty,
      is_shared: i.is_shared,
      is_own: i.owner_id === ctx.userId,
    }));
  const topicOptions = [...new Set((topics ?? []).map((t) => t.topic!).filter(Boolean))].sort().map((t) => ({ value: t, label: t }));

  return (
    <>
      <PageHeader title={d.questions.bankTitle} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchInput placeholder={d.common.search} />
        <UrlSelect param="subject" label={d.common.subject} allLabel={d.common.all} options={(subjects ?? []).map((s) => ({ value: s.id, label: subjectName(s, locale) }))} />
        <UrlSelect param="grade" label={d.common.grade} allLabel={d.common.all} options={Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
        <UrlSelect param="difficulty" label={d.questions.difficulty} allLabel={d.common.all} options={(["easy", "medium", "hard"] as const).map((x) => ({ value: x, label: d.questions.difficulties[x] }))} />
        <UrlSelect param="type" label={d.questions.type} allLabel={d.common.all} options={QUESTION_TYPES.map((t) => ({ value: t, label: d.questions.types[t] }))} />
        {topicOptions.length > 0 && <UrlSelect param="topic" label={d.questions.topic} allLabel={d.common.all} options={topicOptions} />}
      </div>
      <BankManager rows={rows} subjects={(subjects ?? []).map((s) => ({ id: s.id, name: subjectName(s, locale) }))} drafts={drafts ?? []} />
    </>
  );
}
