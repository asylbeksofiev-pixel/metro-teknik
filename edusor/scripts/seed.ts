/**
 * Development seed for EduSOR. Creates two schools (for tenant-isolation testing), users for
 * every role, classes, subjects and one published СОР with every objective question type.
 *
 * Run:  node --experimental-strip-types scripts/seed.ts
 * Safety: refuses to run against a non-local Supabase URL unless --force is passed.
 * The passwords below are for LOCAL DEVELOPMENT ONLY.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
    }
  }
}
loadEnv();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STUDENT_DOMAIN = process.env.STUDENT_LOGIN_EMAIL_DOMAIN ?? "students.edusor.local";
if (!URL_ || !SERVICE || !ANON) throw new Error("Missing Supabase env vars");
if (!/127\.0\.0\.1|localhost/.test(URL_) && !process.argv.includes("--force")) {
  throw new Error(`Refusing to seed non-local Supabase (${URL_}). Pass --force if you really mean it.`);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
export const PASSWORD = "EduSor-dev-2026";

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null || res.data === undefined) throw new Error(`${what}: no data`);
  return res.data as NonNullable<T>;
}

async function user(email: string, fullName: string, opts: { login?: string; superAdmin?: boolean; locale?: "ru" | "kk" } = {}) {
  const existing = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing.data) return existing.data.id as string;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, locale: opts.locale ?? "ru" },
    app_metadata: opts.login ? { login: opts.login } : {},
  });
  if (created.error) throw new Error(`createUser ${email}: ${created.error.message}`);
  const id = created.data.user.id;
  if (opts.superAdmin) must(await admin.from("profiles").update({ is_super_admin: true }).eq("id", id).select("id"), "super admin");
  return id;
}

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

const sid = (login: string) => `${login}@${STUDENT_DOMAIN}`;

async function school(name: string, city: string, code: string) {
  const found = await admin.from("schools").select("id").eq("join_code", code).maybeSingle();
  if (found.data) return found.data.id as string;
  return must(await admin.from("schools").insert({ name, city, region: city, join_code: code }).select("id").single(), "school").id as string;
}

async function membership(schoolId: string, userId: string, role: "school_admin" | "teacher" | "student", code?: string) {
  await admin.from("school_memberships").upsert({ school_id: schoolId, user_id: userId, role, student_code: code ?? null }, { onConflict: "school_id,user_id,role" });
}

async function main() {
  console.log("Seeding EduSOR…");
  await user("superadmin@edusor.local", "Платформа Администратор", { superAdmin: true });

  // ---------------------------------------------------------------- School 1
  const s1 = await school("Школа-гимназия № 1", "Астана", "GYM1AST");
  const year = await admin.from("academic_years").upsert({ school_id: s1, name: "2026–2027", starts_on: "2026-09-01", ends_on: "2027-05-25", is_current: true }, { onConflict: "school_id,name" }).select("id").single();
  const yearId = must(year, "year").id as string;

  const adminId = await user("admin@gym1.edusor.local", "Сейтказиева Динара Маратовна");
  await membership(s1, adminId, "school_admin");
  const t1 = await user("teacher@gym1.edusor.local", "Ахметов Ерлан Серикович");
  const t2 = await user("teacher2@gym1.edusor.local", "Иванова Ольга Петровна", { locale: "kk" });
  await membership(s1, t1, "teacher");
  await membership(s1, t2, "teacher");

  const subjects = must(
    await admin.from("subjects").upsert([
      { school_id: s1, name_ru: "Математика", name_kk: "Математика", code: "MATH" },
      { school_id: s1, name_ru: "Физика", name_kk: "Физика", code: "PHYS" },
      { school_id: s1, name_ru: "Казахский язык и литература", name_kk: "Қазақ тілі мен әдебиеті", code: "KAZ" },
      { school_id: s1, name_ru: "Биология", name_kk: "Биология", code: "BIO" },
    ], { onConflict: "school_id,name_ru" }).select("id, code"),
    "subjects",
  ) as { id: string; code: string }[];
  const subj = (code: string) => subjects.find((s) => s.code === code)!.id;

  const classes = must(
    await admin.from("classes").upsert([
      { school_id: s1, academic_year_id: yearId, name: "7А", grade: 7 },
      { school_id: s1, academic_year_id: yearId, name: "7Б", grade: 7 },
      { school_id: s1, academic_year_id: yearId, name: "9А", grade: 9 },
    ], { onConflict: "school_id,academic_year_id,name" }).select("id, name"),
    "classes",
  ) as { id: string; name: string }[];
  const cls = (n: string) => classes.find((c) => c.name === n)!.id;

  for (const [classId, teacherId, subjectId] of [
    [cls("7А"), t1, subj("MATH")], [cls("7Б"), t1, subj("MATH")], [cls("9А"), t1, subj("PHYS")], [cls("7А"), t2, subj("KAZ")], [cls("9А"), t2, subj("BIO")],
  ] as const) {
    await admin.from("class_teachers").insert({ class_id: classId, teacher_id: teacherId, subject_id: subjectId });
  }

  const students7a = [
    ["aidar.s", "Сапаров Айдар"], ["aruzhan.k", "Касымова Аружан"], ["daniyar.n", "Нурланов Данияр"], ["madina.t", "Тулегенова Мадина"],
    ["timur.b", "Бекенов Тимур"], ["amina.zh", "Жумабаева Амина"],
  ];
  const students7b = [["alikhan.m", "Мухамеджанов Алихан"], ["dana.o", "Омарова Дана"], ["sultan.r", "Рахимов Султан"]];
  const students9a = [["erasyl.a", "Абенов Ерасыл"], ["zarina.s", "Сейтжанова Зарина"]];
  let n = 1;
  for (const [list, className] of [[students7a, "7А"], [students7b, "7Б"], [students9a, "9А"]] as const) {
    for (const [login, name] of list) {
      const id = await user(sid(login!), name!, { login: login! });
      await membership(s1, id, "student", String(n++).padStart(4, "0"));
      await admin.from("class_enrollments").upsert({ class_id: cls(className), student_id: id }, { onConflict: "class_id,student_id" });
    }
  }

  // ---------------------------------------------------------------- School 2 (isolation)
  const s2 = await school("Лицей № 2", "Алматы", "LYC2ALM");
  const t3 = await user("teacher@lyc2.edusor.local", "Ким Сергей Александрович");
  await membership(s2, t3, "teacher");
  const admin2 = await user("admin@lyc2.edusor.local", "Байжанов Нурлан");
  await membership(s2, admin2, "school_admin");
  const c2 = must(await admin.from("classes").upsert({ school_id: s2, name: "8В", grade: 8 }, { onConflict: "school_id,academic_year_id,name" }).select("id").single(), "class2").id as string;
  await admin.from("class_teachers").insert({ class_id: c2, teacher_id: t3 });
  const st2 = await user(sid("lyc2.student"), "Ли Виктория", { login: "lyc2.student" });
  await membership(s2, st2, "student");
  await admin.from("class_enrollments").upsert({ class_id: c2, student_id: st2 }, { onConflict: "class_id,student_id" });

  // ---------------------------------------------------------------- Published sample СОР (created as the teacher → RLS applies)
  const teacher = await signIn("teacher@gym1.edusor.local");
  const exists = await teacher.from("assessments").select("id").eq("title", "СОР №1 по разделу «Линейные уравнения»").maybeSingle();
  if (!exists.data) {
    const due = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const a = must(await teacher.from("assessments").insert({
      school_id: s1, created_by: t1, title: "СОР №1 по разделу «Линейные уравнения»", kind: "sor", subject_id: subj("MATH"), grade: 7, class_id: cls("7А"),
      instructions: "Внимательно прочитайте каждое задание. Калькулятор не используется.", starts_at: new Date(Date.now() - 3600 * 1000).toISOString(), due_at: due,
      duration_minutes: 40, lockdown_mode: true, release_mode: "manual",
    }).select("id").single(), "assessment") as { id: string };
    const q = (position: number, type: string, content: object, answer_key: object, points: number, extra: object = {}) => ({ assessment_id: a.id, position, type, content, answer_key, points, ...extra });
    must(await teacher.from("assessment_questions").insert([
      q(1, "single_choice", { prompt: "Решите уравнение $2x + 6 = 0$.", images: [], options: [{ id: "a1", text: "$x = 3$" }, { id: "b2", text: "$x = -3$" }, { id: "c3", text: "$x = 6$" }, { id: "d4", text: "$x = -6$" }] }, { correct: "b2" }, 1, { topic: "Линейные уравнения", learning_objective: "7.2.2.1 решать линейные уравнения", explanation: "$2x = -6$, значит $x = -3$." }),
      q(2, "multiple_choice", { prompt: "Какие из чисел являются корнями уравнения $|x| = 4$?", images: [], options: [{ id: "a", text: "$4$" }, { id: "b", text: "$-4$" }, { id: "c", text: "$0$" }, { id: "d", text: "$16$" }] }, { correct: ["a", "b"], scoring: "partial" }, 2, { topic: "Модуль числа" }),
      q(3, "true_false", { prompt: "Уравнение $0 \\cdot x = 5$ не имеет корней.", images: [] }, { correct: true }, 1, { topic: "Линейные уравнения" }),
      q(4, "numeric", { prompt: "Найдите корень уравнения $3(x - 2) = 4,5$.", images: [], unit: "" }, { value: 3.5, tolerance: 0 }, 2, { topic: "Линейные уравнения", explanation: "$3x - 6 = 4{,}5 \\Rightarrow 3x = 10{,}5 \\Rightarrow x = 3{,}5$." }),
      q(5, "fill_blanks", { prompt: "Если $a \\ne 0$, то уравнение $ax = b$ имеет [[1]] корень, равный $x = $ [[2]].", images: [] }, { blanks: { "1": ["один", "1", "единственный"], "2": ["b/a", "b : a"] }, caseSensitive: false, scoring: "partial" }, 2, { topic: "Линейные уравнения" }),
      q(6, "matching", { prompt: "Установите соответствие между уравнением и его корнем.", images: [], left: [{ id: "l1", text: "$x + 2 = 5$" }, { id: "l2", text: "$2x = 8$" }, { id: "l3", text: "$x - 1 = 0$" }], right: [{ id: "k9", text: "$1$" }, { id: "m2", text: "$3$" }, { id: "p5", text: "$4$" }] }, { pairs: { l1: "m2", l2: "p5", l3: "k9" }, scoring: "partial" }, 3, { topic: "Линейные уравнения" }),
      q(7, "ordering", { prompt: "Расположите шаги решения уравнения $5x - 3 = 2x + 9$ по порядку.", images: [], items: [{ id: "o3", text: "$3x = 12$" }, { id: "o1", text: "$5x - 2x = 9 + 3$" }, { id: "o4", text: "$x = 4$" }] }, { order: ["o1", "o3", "o4"], scoring: "partial" }, 2, { topic: "Линейные уравнения" }),
      q(8, "essay", { prompt: "Составьте задачу, которая решается с помощью уравнения $x + (x + 5) = 25$, и решите её.", images: [], minWords: 20, maxWords: null }, { referenceAnswer: "Например: «В двух коробках 25 карандашей, во второй на 5 больше, чем в первой». Решение: $2x + 5 = 25$, $x = 10$, во второй 15." }, 4, { topic: "Текстовые задачи", rubric: { criteria: [{ id: "c1", title: "Составлена корректная задача", description: "Условие соответствует уравнению", maxPoints: 2 }, { id: "c2", title: "Верное решение", description: "Решение и ответ верные", maxPoints: 2 }] } }),
    ]).select("id"), "questions");
    must(await teacher.from("assessment_assignments").insert({ assessment_id: a.id, class_id: cls("7А") }).select("id"), "assignment");
    must(await teacher.rpc("publish_assessment", { p_assessment: a.id }), "publish");
    console.log("Published sample assessment", a.id);
  }

  console.log(`
Done. Local accounts (password: ${PASSWORD}):
  super admin   superadmin@edusor.local
  school admin  admin@gym1.edusor.local
  teacher       teacher@gym1.edusor.local   (7А, 7Б math; 9А physics)
  teacher       teacher2@gym1.edusor.local
  student       aidar.s  (login, class 7А)
  other school  teacher@lyc2.edusor.local / lyc2.student
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
