import type { ReactNode } from "react";
import type { AppRole, SessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { NAV } from "./nav-config";
import { Brand, SidebarNav } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { LanguageSwitcher } from "./language-switcher";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

const SETTINGS: Record<AppRole, string> = {
  super_admin: "/super-admin/settings",
  school_admin: "/admin/settings",
  teacher: "/teacher/settings",
  student: "/student/profile",
};

export async function AppShell({ ctx, role, children }: { ctx: SessionContext; role: AppRole; children: ReactNode }) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId)
    .is("read_at", null);
  const school = ctx.memberships.find((m) => m.role === role)?.school;
  const items = NAV[role];

  return (
    <div className="flex min-h-dvh">
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-sidebar py-5 text-white lg:flex">
        <Brand className="mb-6 px-6" />
        <div className="flex-1 overflow-y-auto">
          <SidebarNav items={items} />
        </div>
        {school && <div className="mx-6 mt-4 border-t border-white/10 pt-4 text-xs text-sidebar-foreground/80">{school.name}</div>}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur sm:px-6">
          <MobileNav items={items} />
          <Brand className="lg:hidden" />
          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            <LanguageSwitcher />
            <NotificationBell userId={ctx.userId} initialUnread={count ?? 0} />
            <UserMenu name={ctx.profile.full_name} email={ctx.email} role={role} roles={ctx.roles} settingsHref={SETTINGS[role]} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
