import { requireRole } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const ctx = await requireRole("student");
  return (
    <AppShell ctx={ctx} role="student">
      {children}
    </AppShell>
  );
}
