"use server";

import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { requireRole } from "@/lib/auth/session";
import { audit } from "@/lib/server/audit";
import { LOGIN_RE, fieldErrors } from "@/lib/validation/auth";
import { dbErrorCode, fail, type ActionResult } from "./result";

const uuid = z.string().uuid();

async function adminContext() {
  const ctx = await requireRole("school_admin");
  if (!ctx.schoolId) throw new Error("forbidden");
  return { ctx, schoolId: ctx.schoolId, supabase: await createClient() };
}

function done(path: string) {
  revalidatePath(path);
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("email"),
  role: z.enum(["teacher", "student", "school_admin"]),
  classId: uuid.optional().nullable(),
});

export async function createInvitationAction(input: unknown): Promise<ActionResult<{ link: string }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const { ctx, schoolId, supabase } = await adminContext();
  const token = randomBytes(24).toString("base64url");
  const { data, error } = await supabase
    .from("invitations")
    .insert({
      school_id: schoolId,
      email: parsed.data.email,
      role: parsed.data.role,
      class_id: parsed.data.role === "student" ? (parsed.data.classId ?? null) : null,
      token_hash: createHash("sha256").update(token).digest("hex"),
      invited_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId, action: "invitation.created", entityType: "invitation", entityId: data.id, metadata: { role: parsed.data.role } });
  done("/admin/teachers");
  done("/admin/students");
  return { ok: true, data: { link: `${publicEnv.NEXT_PUBLIC_APP_URL}/register?invite=${token}` } };
}

export async function revokeInvitationAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("invalid");
  const { ctx, schoolId, supabase } = await adminContext();
  const { error } = await supabase.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("school_id", schoolId);
  if (error) return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId, action: "invitation.revoked", entityType: "invitation", entityId: id });
  done("/admin/teachers");
  done("/admin/students");
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Student accounts without email
// ---------------------------------------------------------------------------
const studentLoginSchema = z.object({
  fullName: z.string().trim().min(3, "tooShort").max(200, "tooLong"),
  login: z.string().trim().toLowerCase().regex(LOGIN_RE, "login"),
  studentCode: z.string().trim().max(40, "tooLong").optional(),
  classId: uuid.optional().nullable(),
});

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function createStudentLoginAction(input: unknown): Promise<ActionResult<{ login: string; password: string }>> {
  const parsed = studentLoginSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const { ctx, schoolId, supabase } = await adminContext();

  // Confirm (through RLS) that the class belongs to this admin's school.
  if (parsed.data.classId) {
    const { data: cls } = await supabase.from("classes").select("id").eq("id", parsed.data.classId).eq("school_id", schoolId).maybeSingle();
    if (!cls) return fail("forbidden");
  }

  const admin = createAdminClient();
  const password = generatePassword();
  const email = `${parsed.data.login}@${serverEnv().STUDENT_LOGIN_EMAIL_DOMAIN}`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { login: parsed.data.login },
    user_metadata: { full_name: parsed.data.fullName, locale: ctx.profile.locale },
  });
  if (error || !created.user) {
    return fail("validation", { login: error?.code === "email_exists" ? "login" : "invalid" });
  }
  const userId = created.user.id;
  const { error: mErr } = await admin
    .from("school_memberships")
    .insert({ school_id: schoolId, user_id: userId, role: "student", student_code: parsed.data.studentCode || null });
  if (mErr) {
    await admin.auth.admin.deleteUser(userId);
    return fail("generic");
  }
  if (parsed.data.classId) {
    await admin.from("class_enrollments").insert({ class_id: parsed.data.classId, student_id: userId });
  }
  await audit({ actorId: ctx.userId, schoolId, action: "student.login_created", entityType: "profile", entityId: userId });
  done("/admin/students");
  return { ok: true, data: { login: parsed.data.login, password } };
}

export async function resetStudentPasswordAction(studentId: string): Promise<ActionResult<{ password: string }>> {
  if (!uuid.safeParse(studentId).success) return fail("invalid");
  const { ctx, schoolId, supabase } = await adminContext();
  const { data: m } = await supabase.from("school_memberships").select("id").eq("school_id", schoolId).eq("user_id", studentId).eq("role", "student").maybeSingle();
  if (!m) return fail("forbidden");
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("login").eq("id", studentId).single();
  if (!profile?.login) return fail("forbidden"); // only login-based (no email) students
  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(studentId, { password });
  if (error) return fail("generic");
  await audit({ actorId: ctx.userId, schoolId, action: "student.password_reset", entityType: "profile", entityId: studentId });
  return { ok: true, data: { password } };
}

export async function setMembershipStatusAction(membershipId: string, status: "active" | "suspended"): Promise<ActionResult> {
  if (!uuid.safeParse(membershipId).success) return fail("invalid");
  const { ctx, schoolId, supabase } = await adminContext();
  const { error, count } = await supabase.from("school_memberships").update({ status }, { count: "exact" }).eq("id", membershipId).eq("school_id", schoolId);
  if (error || !count) return fail(error ? dbErrorCode(error) : "forbidden");
  await audit({ actorId: ctx.userId, schoolId, action: `membership.${status}`, entityType: "membership", entityId: membershipId });
  done("/admin/teachers");
  done("/admin/students");
  return { ok: true, data: undefined };
}

export async function reviewTeacherRequestAction(id: string, approve: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("invalid");
  const { ctx, schoolId, supabase } = await adminContext();
  const { error } = await supabase.rpc("review_teacher_request", { p_request: id, p_approve: approve });
  if (error) return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId, action: approve ? "teacher_request.approved" : "teacher_request.rejected", entityType: "teacher_request", entityId: id });
  done("/admin/teachers");
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Academic structure
// ---------------------------------------------------------------------------
const classSchema = z.object({
  name: z.string().trim().min(1, "required").max(40, "tooLong"),
  grade: z.coerce.number().int().min(0).max(12),
  academicYearId: uuid.optional().nullable(),
});

export async function createClassAction(input: unknown): Promise<ActionResult> {
  const parsed = classSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const { ctx, schoolId, supabase } = await adminContext();
  const { data, error } = await supabase
    .from("classes")
    .insert({ school_id: schoolId, name: parsed.data.name, grade: parsed.data.grade, academic_year_id: parsed.data.academicYearId || null })
    .select("id")
    .single();
  if (error) return fail(error.code === "23505" ? "validation" : dbErrorCode(error), error.code === "23505" ? { name: "invalid" } : undefined);
  await audit({ actorId: ctx.userId, schoolId, action: "class.created", entityType: "class", entityId: data.id });
  done("/admin/classes");
  return { ok: true, data: undefined };
}

export async function deleteClassAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("invalid");
  const { ctx, schoolId, supabase } = await adminContext();
  const { error } = await supabase.from("classes").delete().eq("id", id).eq("school_id", schoolId);
  if (error) return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId, action: "class.deleted", entityType: "class", entityId: id });
  done("/admin/classes");
  return { ok: true, data: undefined };
}

export async function assignTeacherAction(classId: string, teacherId: string, subjectId: string | null): Promise<ActionResult> {
  const p = z.object({ classId: uuid, teacherId: uuid, subjectId: uuid.nullable() }).safeParse({ classId, teacherId, subjectId: subjectId || null });
  if (!p.success) return fail("invalid");
  const { ctx, schoolId, supabase } = await adminContext();
  const { error } = await supabase.from("class_teachers").insert({ class_id: p.data.classId, teacher_id: p.data.teacherId, subject_id: p.data.subjectId });
  if (error && error.code !== "23505") return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId, action: "class.teacher_assigned", entityType: "class", entityId: classId, metadata: { teacherId, subjectId } });
  done(`/admin/classes/${classId}`);
  return { ok: true, data: undefined };
}

export async function removeTeacherAction(classTeacherId: string, classId: string): Promise<ActionResult> {
  if (!uuid.safeParse(classTeacherId).success) return fail("invalid");
  const { ctx, schoolId, supabase } = await adminContext();
  const { error } = await supabase.from("class_teachers").delete().eq("id", classTeacherId);
  if (error) return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId, action: "class.teacher_removed", entityType: "class", entityId: classId });
  done(`/admin/classes/${classId}`);
  return { ok: true, data: undefined };
}

export async function enrollStudentAction(classId: string, studentId: string): Promise<ActionResult> {
  const p = z.object({ classId: uuid, studentId: uuid }).safeParse({ classId, studentId });
  if (!p.success) return fail("invalid");
  const { ctx, schoolId, supabase } = await adminContext();
  const { error } = await supabase.from("class_enrollments").insert({ class_id: classId, student_id: studentId });
  if (error && error.code !== "23505") return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId, action: "class.student_enrolled", entityType: "class", entityId: classId, metadata: { studentId } });
  done(`/admin/classes/${classId}`);
  return { ok: true, data: undefined };
}

export async function unenrollStudentAction(enrollmentId: string, classId: string): Promise<ActionResult> {
  if (!uuid.safeParse(enrollmentId).success) return fail("invalid");
  const { ctx, schoolId, supabase } = await adminContext();
  const { error } = await supabase.from("class_enrollments").delete().eq("id", enrollmentId);
  if (error) return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId, action: "class.student_unenrolled", entityType: "class", entityId: classId });
  done(`/admin/classes/${classId}`);
  return { ok: true, data: undefined };
}

const subjectSchema = z.object({
  nameRu: z.string().trim().min(1, "required").max(120, "tooLong"),
  nameKk: z.string().trim().min(1, "required").max(120, "tooLong"),
  code: z.string().trim().max(20, "tooLong").optional(),
});

export async function createSubjectAction(input: unknown): Promise<ActionResult> {
  const parsed = subjectSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const { ctx, schoolId, supabase } = await adminContext();
  const { error } = await supabase.from("subjects").insert({ school_id: schoolId, name_ru: parsed.data.nameRu, name_kk: parsed.data.nameKk, code: parsed.data.code || null });
  if (error) return fail(error.code === "23505" ? "validation" : dbErrorCode(error), error.code === "23505" ? { nameRu: "invalid" } : undefined);
  await audit({ actorId: ctx.userId, schoolId, action: "subject.created", entityType: "subject" });
  done("/admin/classes");
  return { ok: true, data: undefined };
}

export async function deleteSubjectAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("invalid");
  const { ctx, schoolId, supabase } = await adminContext();
  const { error } = await supabase.from("subjects").delete().eq("id", id).eq("school_id", schoolId);
  if (error) return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId, action: "subject.deleted", entityType: "subject", entityId: id });
  done("/admin/classes");
  return { ok: true, data: undefined };
}

const yearSchema = z
  .object({
    name: z.string().trim().min(4, "tooShort").max(40, "tooLong"),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "required"),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "required"),
  })
  .refine((v) => v.endsOn > v.startsOn, { path: ["endsOn"], message: "dateOrder" });

export async function createAcademicYearAction(input: unknown): Promise<ActionResult> {
  const parsed = yearSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const { ctx, schoolId, supabase } = await adminContext();
  const { count } = await supabase.from("academic_years").select("id", { count: "exact", head: true }).eq("school_id", schoolId);
  const { error } = await supabase.from("academic_years").insert({
    school_id: schoolId,
    name: parsed.data.name,
    starts_on: parsed.data.startsOn,
    ends_on: parsed.data.endsOn,
    is_current: (count ?? 0) === 0,
  });
  if (error) return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId, action: "academic_year.created", entityType: "academic_year" });
  done("/admin/settings");
  return { ok: true, data: undefined };
}

export async function setCurrentYearAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("invalid");
  const { ctx, schoolId, supabase } = await adminContext();
  const { error: e1 } = await supabase.from("academic_years").update({ is_current: false }).eq("school_id", schoolId).eq("is_current", true);
  const { error: e2 } = await supabase.from("academic_years").update({ is_current: true }).eq("id", id).eq("school_id", schoolId);
  if (e1 || e2) return fail(dbErrorCode(e1 ?? e2));
  await audit({ actorId: ctx.userId, schoolId, action: "academic_year.current", entityType: "academic_year", entityId: id });
  done("/admin/settings");
  return { ok: true, data: undefined };
}

const schoolSchema = z.object({
  name: z.string().trim().min(2, "tooShort").max(200, "tooLong"),
  city: z.string().trim().max(100, "tooLong").optional(),
  region: z.string().trim().max(100, "tooLong").optional(),
});

export async function updateSchoolAction(input: unknown): Promise<ActionResult> {
  const parsed = schoolSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const { ctx, schoolId, supabase } = await adminContext();
  const { error } = await supabase.from("schools").update({ name: parsed.data.name, city: parsed.data.city || null, region: parsed.data.region || null }).eq("id", schoolId);
  if (error) return fail(dbErrorCode(error));
  await audit({ actorId: ctx.userId, schoolId, action: "school.updated", entityType: "school", entityId: schoolId });
  done("/admin/settings");
  return { ok: true, data: undefined };
}

const accommodationSchema = z.object({
  studentId: uuid,
  extraMinutes: z.coerce.number().int().min(0).max(600),
  extraAttempts: z.coerce.number().int().min(0).max(5),
  note: z.string().max(500).optional(),
});

export async function setAccommodationAction(input: unknown): Promise<ActionResult> {
  const parsed = accommodationSchema.safeParse(input);
  if (!parsed.success) return fail("validation", fieldErrors(parsed.error));
  const { ctx, schoolId, supabase } = await adminContext();
  await supabase.from("student_accommodations").delete().eq("student_id", parsed.data.studentId).eq("school_id", schoolId).is("assessment_id", null);
  if (parsed.data.extraMinutes > 0 || parsed.data.extraAttempts > 0) {
    const { error } = await supabase.from("student_accommodations").insert({
      school_id: schoolId,
      student_id: parsed.data.studentId,
      extra_minutes: parsed.data.extraMinutes,
      extra_attempts: parsed.data.extraAttempts,
      note: parsed.data.note || null,
      created_by: ctx.userId,
    });
    if (error) return fail(dbErrorCode(error));
  }
  await audit({ actorId: ctx.userId, schoolId, action: "student.accommodation_set", entityType: "profile", entityId: parsed.data.studentId });
  done("/admin/students");
  return { ok: true, data: undefined };
}
