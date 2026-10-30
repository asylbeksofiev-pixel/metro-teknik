import type { AppRole } from "@/lib/auth/session";

export type NavIcon =
  | "home" | "classes" | "students" | "subjects" | "bank" | "assessments" | "documents" | "live" | "analytics"
  | "settings" | "results" | "progress" | "profile" | "teachers" | "reports" | "schools" | "users" | "audit" | "review";

export type NavItem = { href: string; labelKey: string; icon: NavIcon };

export const NAV: Record<AppRole, NavItem[]> = {
  teacher: [
    { href: "/teacher/dashboard", labelKey: "dashboard", icon: "home" },
    { href: "/teacher/classes", labelKey: "myClasses", icon: "classes" },
    { href: "/teacher/students", labelKey: "students", icon: "students" },
    { href: "/teacher/subjects", labelKey: "subjects", icon: "subjects" },
    { href: "/teacher/question-bank", labelKey: "questionBank", icon: "bank" },
    { href: "/teacher/assessments", labelKey: "assessments", icon: "assessments" },
    { href: "/teacher/documents", labelKey: "documents", icon: "documents" },
    { href: "/teacher/live", labelKey: "liveMonitoring", icon: "live" },
    { href: "/teacher/analytics", labelKey: "analytics", icon: "analytics" },
    { href: "/teacher/settings", labelKey: "settings", icon: "settings" },
  ],
  student: [
    { href: "/student/dashboard", labelKey: "dashboard", icon: "home" },
    { href: "/student/classes", labelKey: "myClasses", icon: "classes" },
    { href: "/student/assessments", labelKey: "assessments", icon: "assessments" },
    { href: "/student/results", labelKey: "results", icon: "results" },
    { href: "/student/progress", labelKey: "progress", icon: "progress" },
    { href: "/student/profile", labelKey: "profile", icon: "profile" },
  ],
  school_admin: [
    { href: "/admin/dashboard", labelKey: "dashboard", icon: "home" },
    { href: "/admin/teachers", labelKey: "teachers", icon: "teachers" },
    { href: "/admin/students", labelKey: "students", icon: "students" },
    { href: "/admin/classes", labelKey: "myClasses", icon: "classes" },
    { href: "/admin/reports", labelKey: "reports", icon: "reports" },
    { href: "/admin/settings", labelKey: "settings", icon: "settings" },
  ],
  super_admin: [
    { href: "/super-admin/dashboard", labelKey: "dashboard", icon: "home" },
    { href: "/super-admin/schools", labelKey: "schools", icon: "schools" },
    { href: "/super-admin/users", labelKey: "users", icon: "users" },
    { href: "/super-admin/settings", labelKey: "settings", icon: "settings" },
    { href: "/super-admin/audit", labelKey: "audit", icon: "audit" },
  ],
};
