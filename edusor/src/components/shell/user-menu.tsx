"use client";

import Link from "next/link";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Repeat } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { signOutAction } from "@/lib/actions/auth";
import type { AppRole } from "@/lib/auth/session";

const HOME: Record<AppRole, string> = {
  super_admin: "/super-admin/dashboard",
  school_admin: "/admin/dashboard",
  teacher: "/teacher/dashboard",
  student: "/student/dashboard",
};

export function UserMenu({ name, email, role, roles, settingsHref }: { name: string; email: string | null; role: AppRole; roles: AppRole[]; settingsHref: string }) {
  const { d } = useI18n();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{initials}</span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-40 truncate text-[13px] font-medium">{name || email}</span>
          <span className="block text-[11px] text-muted-foreground">{d.roles[role]}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={6} className="z-50 min-w-56 rounded-md border border-border bg-surface p-1 shadow-lg">
          <div className="px-2.5 py-2 text-xs text-muted-foreground">{email}</div>
          <Dropdown.Separator className="my-1 h-px bg-border" />
          {roles.filter((r) => r !== role).map((r) => (
            <Dropdown.Item key={r} asChild>
              <Link href={HOME[r]} className="flex items-center gap-2 rounded px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-muted">
                <Repeat className="size-4" /> {d.roles[r]}
              </Link>
            </Dropdown.Item>
          ))}
          <Dropdown.Item asChild>
            <Link href={settingsHref} className="flex items-center gap-2 rounded px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-muted">
              {d.common.settings}
            </Link>
          </Dropdown.Item>
          <Dropdown.Separator className="my-1 h-px bg-border" />
          <Dropdown.Item
            onSelect={() => void signOutAction()}
            className="flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-sm text-danger outline-none data-[highlighted]:bg-danger-soft"
          >
            <LogOut className="size-4" /> {d.common.signOut}
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
