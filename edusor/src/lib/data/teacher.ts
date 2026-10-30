import "server-only";
import type { ServerClient } from "@/lib/supabase/server";

/** Classes the teacher is assigned to, with subjects and enrollment counts. */
export async function teacherClasses(supabase: ServerClient, teacherId: string) {
  const { data } = await supabase
    .from("class_teachers")
    .select("class:classes(id, name, grade, class_enrollments(count)), subject:subjects(id, name_ru, name_kk)")
    .eq("teacher_id", teacherId);
  const map = new Map<string, { id: string; name: string; grade: number; students: number; subjects: { id: string; name_ru: string; name_kk: string }[] }>();
  for (const row of data ?? []) {
    if (!row.class) continue;
    const entry = map.get(row.class.id) ?? { id: row.class.id, name: row.class.name, grade: row.class.grade, students: row.class.class_enrollments[0]?.count ?? 0, subjects: [] };
    if (row.subject && !entry.subjects.some((s) => s.id === row.subject!.id)) entry.subjects.push(row.subject);
    map.set(row.class.id, entry);
  }
  return [...map.values()].sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
}

export async function teacherStudentIds(supabase: ServerClient, classIds: string[]) {
  if (!classIds.length) return [];
  const { data } = await supabase.from("class_enrollments").select("student_id").in("class_id", classIds);
  return [...new Set((data ?? []).map((r) => r.student_id))];
}
