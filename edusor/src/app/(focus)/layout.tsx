import { requireRole } from "@/lib/auth/session";

/** Minimal, distraction-free layout used while a student takes an assessment. */
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  await requireRole("student");
  return <div className="min-h-dvh bg-background">{children}</div>;
}
