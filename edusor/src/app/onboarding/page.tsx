import { redirect } from "next/navigation";
import { requireSession, homeFor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInviteForm, TeacherRequestForm } from "@/components/onboarding/onboarding-forms";
import { Badge } from "@/components/ui/badge";
import { signOutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const ctx = await requireSession();
  if (ctx.roles.length > 0 && !invite) redirect(homeFor(ctx));
  const { d } = await getI18n();
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("teacher_verification_requests")
    .select("id, status, created_at")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <AuthCard title={d.onboarding.title} subtitle={ctx.roles.length === 0 ? d.onboarding.noMembership : undefined}>
      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-1 text-sm font-semibold">{d.onboarding.inviteTitle}</h2>
          <p className="mb-3 text-[13px] text-muted-foreground">{d.onboarding.inviteText}</p>
          <AcceptInviteForm initialToken={invite} />
        </section>
        <section className="border-t border-border pt-6">
          <h2 className="mb-1 text-sm font-semibold">{d.onboarding.teacherTitle}</h2>
          <p className="mb-3 text-[13px] text-muted-foreground">{d.onboarding.teacherText}</p>
          <TeacherRequestForm />
          {requests && requests.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{d.onboarding.pendingRequests}</p>
              <ul className="flex flex-col gap-1">
                {requests.map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-[13px]">
                    <span>{new Date(r.created_at).toLocaleDateString()}</span>
                    <Badge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{d.status[r.status === "approved" ? "published" : r.status === "rejected" ? "closed" : "pending"]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <p className="text-xs text-muted-foreground">{d.onboarding.studentText}</p>
        <form action={signOutAction}><Button variant="ghost" size="sm" type="submit">{d.common.signOut}</Button></form>
      </div>
    </AuthCard>
  );
}
