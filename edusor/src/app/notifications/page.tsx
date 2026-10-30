import Link from "next/link";
import { Bell } from "lucide-react";
import { requireSession, type AppRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/i18n/format";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardBody } from "@/components/ui/card";
import { ActionButton } from "@/components/forms/action-button";
import { markAllReadAction } from "@/lib/actions/notifications";
import { cn, fmt } from "@/lib/utils";

export default async function NotificationsPage() {
  const ctx = await requireSession();
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(100);
  const role = (["super_admin", "school_admin", "teacher", "student"] as AppRole[]).find((r) => ctx.roles.includes(r));
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  const body = (
    <>
      <PageHeader title={d.notifications.title} actions={unread > 0 ? <ActionButton action={markAllReadAction}>{d.notifications.markAllRead}</ActionButton> : undefined} />
      <Card>
        <CardBody className="p-0">
          {!data?.length ? <EmptyState icon={Bell} title={d.notifications.empty} /> : (
            <ul className="divide-y divide-border">
              {data.map((n) => {
                const text = fmt((d.notifications.types as Record<string, string>)[n.type] ?? n.type, (n.payload ?? {}) as Record<string, string>);
                return (
                  <li key={n.id}>
                    <Link href={n.link ?? "#"} className={cn("flex items-start justify-between gap-3 px-5 py-3 hover:bg-muted/40", !n.read_at && "bg-primary-soft/40")}>
                      <span className="flex items-start gap-2 text-sm">{!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />}{text}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(n.created_at, locale)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
  return role ? <AppShell ctx={ctx} role={role}>{body}</AppShell> : <main className="mx-auto max-w-3xl px-4 py-8">{body}</main>;
}
