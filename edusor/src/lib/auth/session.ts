import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type AppRole = "super_admin" | "school_admin" | "teacher" | "student";

export type Membership = Pick<Tables<"school_memberships">, "id" | "school_id" | "role" | "status"> & {
  school: Pick<Tables<"schools">, "id" | "name" | "is_active"> | null;
};

export type SessionContext = {
  userId: string;
  email: string | null;
  profile: Tables<"profiles">;
  memberships: Membership[];
  roles: AppRole[];
};

/** Loads the signed-in user, their profile and active memberships (cached per request). */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("school_memberships")
      .select("id, school_id, role, status, school:schools(id, name, is_active)")
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);
  if (!profile) return null;

  const active = (memberships ?? []).filter((m) => m.school?.is_active !== false) as Membership[];
  const roles = new Set<AppRole>(active.map((m) => m.role));
  if (profile.is_super_admin) roles.add("super_admin");

  return { userId: user.id, email: user.email ?? null, profile, memberships: active, roles: [...roles] };
});

export const ROLE_HOME: Record<AppRole, string> = {
  super_admin: "/super-admin/dashboard",
  school_admin: "/admin/dashboard",
  teacher: "/teacher/dashboard",
  student: "/student/dashboard",
};

const ROLE_PRIORITY: AppRole[] = ["super_admin", "school_admin", "teacher", "student"];

export function homeFor(ctx: SessionContext): string {
  const role = ROLE_PRIORITY.find((r) => ctx.roles.includes(r));
  return role ? ROLE_HOME[role] : "/onboarding";
}

export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Server-side route guard. RLS remains the source of truth for data access. */
export async function requireRole(role: AppRole): Promise<SessionContext & { schoolId: string | null }> {
  const ctx = await requireSession();
  if (!ctx.roles.includes(role)) redirect(homeFor(ctx));
  const membership = ctx.memberships.find((m) => m.role === role);
  return { ...ctx, schoolId: membership?.school_id ?? null };
}
