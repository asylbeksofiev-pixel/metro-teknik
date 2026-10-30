import { School, Users, ClipboardList, Activity, Bot, Coins } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/i18n/format";
import { PageHeader, StatCard, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";

export default async function SuperDashboard() {
  await requireRole("super_admin");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const c = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const [schools, users, assessments, attempts, { data: usage }, { data: errors }] = await Promise.all([
    c(supabase.from("schools").select("id", { count: "exact", head: true })),
    c(supabase.from("profiles").select("id", { count: "exact", head: true })),
    c(supabase.from("assessments").select("id", { count: "exact", head: true })),
    c(supabase.from("attempts").select("id", { count: "exact", head: true })),
    supabase.from("ai_usage").select("prompt_tokens, completion_tokens, success").gte("created_at", since),
    supabase.from("system_errors").select("id, source, message, created_at").order("created_at", { ascending: false }).limit(8),
  ]);
  const tokens = (usage ?? []).reduce((s, u) => s + (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0), 0);
  const failed = (usage ?? []).filter((u) => !u.success).length;
  return (
    <>
      <PageHeader title={d.superAdmin.dashboardTitle} />
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label={d.superAdmin.schools} value={schools} icon={School} />
        <StatCard label={d.superAdmin.users} value={users} icon={Users} tone="info" />
        <StatCard label={d.superAdmin.assessments} value={assessments} icon={ClipboardList} tone="success" />
        <StatCard label={d.superAdmin.attempts} value={attempts} icon={Activity} tone="warning" />
        <StatCard label={d.superAdmin.aiCalls} value={usage?.length ?? 0} icon={Bot} hint={failed ? `✕ ${failed}` : undefined} />
        <StatCard label={d.superAdmin.aiTokens} value={tokens.toLocaleString("ru-RU")} icon={Coins} />
      </div>
      <Card className="mt-6">
        <CardHeader title={d.superAdmin.systemErrors} />
        <CardBody className="p-0">
          {!errors?.length ? <EmptyState title={d.superAdmin.noErrors} /> : (
            <ul className="divide-y divide-border">
              {errors.map((e) => (
                <li key={e.id} className="px-5 py-2.5 text-[13px]">
                  <span className="font-mono text-xs text-muted-foreground">{formatDateTime(e.created_at, locale)} · {e.source}</span>
                  <p className="truncate">{e.message}</p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
