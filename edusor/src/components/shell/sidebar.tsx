"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, BookOpen, ClipboardList, FileText, GraduationCap, Home, Library, LineChart, ListChecks,
  Radio, ScrollText, School, Settings, Trophy, User, Users, UserSquare2, FileSearch,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { NavIcon, NavItem } from "./nav-config";

const ICONS: Record<NavIcon, LucideIcon> = {
  home: Home, classes: GraduationCap, students: Users, subjects: BookOpen, bank: Library, assessments: ClipboardList,
  documents: FileText, live: Radio, analytics: BarChart3, settings: Settings, results: Trophy, progress: LineChart,
  profile: User, teachers: UserSquare2, reports: ListChecks, schools: School, users: Users, audit: ScrollText, review: FileSearch,
};

export function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { d } = useI18n();
  const labels = d.nav as Record<string, string>;
  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors",
              active ? "bg-sidebar-active text-white" : "text-sidebar-foreground hover:bg-sidebar-active/60 hover:text-white",
            )}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden />
            {labels[item.labelKey] ?? item.labelKey}
          </Link>
        );
      })}
    </nav>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-white">E</div>
      <span className="text-[15px] font-semibold tracking-tight">EduSOR</span>
    </div>
  );
}
