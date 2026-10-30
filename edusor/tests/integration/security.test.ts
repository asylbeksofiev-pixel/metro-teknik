/**
 * Security & reliability integration tests against a running local Supabase with the dev seed.
 *   npx supabase db reset && node --experimental-strip-types scripts/seed.ts && npm run test:integration
 * Every check goes through the public API with real user sessions, so RLS is what is being tested.
 */
import { readFileSync, existsSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DOMAIN = process.env.STUDENT_LOGIN_EMAIL_DOMAIN ?? "students.edusor.local";
const PASSWORD = "EduSor-dev-2026";
const TITLE = "СОР №1 по разделу «Линейные уравнения»";

async function as(email: string): Promise<SupabaseClient> {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
}

const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
let teacher: SupabaseClient, teacherOtherSubject: SupabaseClient, teacherOtherSchool: SupabaseClient;
let student: SupabaseClient, classmate: SupabaseClient, studentOtherClass: SupabaseClient, studentOtherSchool: SupabaseClient, anon: SupabaseClient;
let assessmentId: string;
let studentId: string;

beforeAll(async () => {
  [teacher, teacherOtherSubject, teacherOtherSchool, student, classmate, studentOtherClass, studentOtherSchool] = await Promise.all([
    as("teacher@gym1.edusor.local"),
    as("teacher2@gym1.edusor.local"),
    as("teacher@lyc2.edusor.local"),
    as(`aidar.s@${DOMAIN}`),
    as(`aruzhan.k@${DOMAIN}`),
    as(`alikhan.m@${DOMAIN}`),
    as(`lyc2.student@${DOMAIN}`),
  ]);
  anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data } = await service.from("assessments").select("id").eq("title", TITLE).single();
  assessmentId = data!.id;
  studentId = (await student.auth.getUser()).data.user!.id;
  // Start from a clean slate for this student's attempts.
  await service.from("attempts").delete().eq("assessment_id", assessmentId).eq("student_id", studentId);
});

describe("tenant isolation", () => {
  it("anonymous users read nothing", async () => {
    for (const table of ["profiles", "schools", "assessments", "assessment_snapshots", "attempts", "final_grades"] as const) {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("a teacher of another school sees none of school 1's data", async () => {
    const { data: a } = await teacherOtherSchool.from("assessments").select("id").eq("id", assessmentId);
    expect(a).toHaveLength(0);
    const { data: p } = await teacherOtherSchool.from("profiles").select("id").eq("id", studentId);
    expect(p).toHaveLength(0);
    const { data: c } = await teacherOtherSchool.from("classes").select("id, name").eq("name", "7А");
    expect(c).toHaveLength(0);
  });

  it("a student of another school cannot see or start the assessment", async () => {
    const { data } = await studentOtherSchool.from("assessments").select("id").eq("id", assessmentId);
    expect(data).toHaveLength(0);
    const { error } = await studentOtherSchool.rpc("start_attempt", { p_assessment: assessmentId });
    expect(error?.message).toBe("forbidden");
  });

  it("a student of the same school but another class cannot start it", async () => {
    const { error } = await studentOtherClass.rpc("start_attempt", { p_assessment: assessmentId });
    expect(error?.message).toBe("forbidden");
  });

  it("a teacher of the same class but another subject cannot manage the assessment", async () => {
    const { data } = await teacherOtherSubject.from("assessment_questions").select("id").eq("assessment_id", assessmentId);
    expect(data).toHaveLength(0);
  });
});

describe("answer key secrecy", () => {
  it("students cannot read builder questions (which contain keys)", async () => {
    const { data } = await student.from("assessment_questions").select("id, answer_key").eq("assessment_id", assessmentId);
    expect(data).toHaveLength(0);
  });

  it("the student-visible snapshot contains no answer keys", async () => {
    const { data } = await student.from("assessment_snapshots").select("questions").eq("assessment_id", assessmentId).single();
    const json = JSON.stringify(data!.questions);
    expect(json).not.toMatch(/answer_key|"correct"|"accepted"|"pairs"|referenceAnswer|"order"/);
    expect((data!.questions as unknown[]).length).toBeGreaterThan(0);
  });

  it("ordering items are not stored in answer order in the snapshot", async () => {
    const { data } = await student.from("assessment_snapshots").select("questions").eq("assessment_id", assessmentId).single();
    const ordering = (data!.questions as { type: string; content: { items: { id: string }[] } }[]).find((q) => q.type === "ordering")!;
    expect(ordering.content.items.map((i) => i.id).join(",")).not.toBe("o1,o3,o4");
  });

  it("students cannot read snapshot keys before release", async () => {
    const { data } = await student.from("assessment_snapshot_keys").select("question_id");
    expect(data).toHaveLength(0);
  });

  it("the teacher can read the keys", async () => {
    const { data } = await teacher.from("assessment_snapshot_keys").select("question_id");
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

describe("attempt lifecycle", () => {
  let attemptId: string;
  let questionId: string;

  it("starts an attempt with a server-side deadline", async () => {
    const { data, error } = await student.rpc("start_attempt", { p_assessment: assessmentId });
    expect(error).toBeNull();
    attemptId = data as string;
    const { data: t } = await student.from("attempts").select("started_at, deadline_at, question_order").eq("id", attemptId).single();
    const minutes = (new Date(t!.deadline_at!).getTime() - new Date(t!.started_at).getTime()) / 60000;
    expect(minutes).toBeGreaterThan(39.9);
    expect(minutes).toBeLessThanOrEqual(40.01);
    questionId = (t!.question_order as string[])[0]!;
  });

  it("starting again returns the same in-progress attempt", async () => {
    const { data } = await student.rpc("start_attempt", { p_assessment: assessmentId });
    expect(data).toBe(attemptId);
  });

  it("autosave ignores stale (older sequence) writes", async () => {
    await student.rpc("save_answer", { p_attempt: attemptId, p_question: questionId, p_response: { optionId: "new" }, p_seq: 5 });
    const { data: stale } = await student.rpc("save_answer", { p_attempt: attemptId, p_question: questionId, p_response: { optionId: "old" }, p_seq: 3 });
    expect((stale as { applied: boolean }).applied).toBe(false);
    const { data } = await student.from("answers").select("response, client_seq").eq("attempt_id", attemptId).eq("question_id", questionId).single();
    expect(data).toMatchObject({ response: { optionId: "new" }, client_seq: 5 });
  });

  it("another student cannot write into or read this attempt", async () => {
    const { error } = await classmate.rpc("save_answer", { p_attempt: attemptId, p_question: questionId, p_response: { optionId: "x" }, p_seq: 99 });
    expect(error?.message).toBe("forbidden");
    const { data } = await classmate.from("answers").select("id").eq("attempt_id", attemptId);
    expect(data).toHaveLength(0);
    const { data: t } = await classmate.from("attempts").select("id").eq("id", attemptId);
    expect(t).toHaveLength(0);
  });

  it("students cannot write attempts, grades or scores directly", async () => {
    const upd = await student.from("attempts").update({ deadline_at: "2099-01-01T00:00:00Z" }).eq("id", attemptId).select("id");
    expect(upd.data ?? []).toHaveLength(0);
    const ins = await student.from("final_grades").insert({ attempt_id: attemptId, assessment_id: assessmentId, student_id: studentId, score: 99, max_score: 17, percent: 100, approved_by: studentId });
    expect(ins.error).not.toBeNull();
    const rel = await student.from("result_releases").insert({ attempt_id: attemptId, assessment_id: assessmentId });
    expect(rel.error).not.toBeNull();
  });

  it("students cannot escalate privileges through their profile", async () => {
    const { error } = await student.from("profiles").update({ is_super_admin: true }).eq("id", studentId);
    expect(error).not.toBeNull();
  });

  it("lockdown events: own in-progress attempt only", async () => {
    const own = await student.from("lockdown_events").insert({ attempt_id: attemptId, assessment_id: assessmentId, student_id: studentId, event_type: "visibility_hidden" });
    expect(own.error).toBeNull();
    const classmateId = (await classmate.auth.getUser()).data.user!.id;
    const forged = await classmate.from("lockdown_events").insert({ attempt_id: attemptId, assessment_id: assessmentId, student_id: classmateId, event_type: "visibility_hidden" });
    expect(forged.error).not.toBeNull();
    const { data } = await teacher.from("attempts").select("lockdown_event_count").eq("id", attemptId).single();
    expect(data!.lockdown_event_count).toBe(1);
  });

  it("submission is idempotent and locks the attempt", async () => {
    const first = await student.rpc("submit_attempt", { p_attempt: attemptId });
    expect(first.data).toMatchObject({ status: "submitted", duplicate: false });
    const second = await student.rpc("submit_attempt", { p_attempt: attemptId });
    expect(second.data).toMatchObject({ status: "submitted", duplicate: true });
    const { data: late } = await student.rpc("save_answer", { p_attempt: attemptId, p_question: questionId, p_response: { optionId: "late" }, p_seq: 100 });
    expect(late).toMatchObject({ ok: false, reason: "locked" });
  });

  it("no further attempts beyond the configured maximum", async () => {
    const { error } = await student.rpc("start_attempt", { p_assessment: assessmentId });
    expect(error?.message).toBe("no_attempts_left");
  });

  it("scores stay hidden from the student until release", async () => {
    const { data } = await student.from("question_scores").select("answer_id").eq("attempt_id", attemptId);
    expect(data).toHaveLength(0);
  });
});
