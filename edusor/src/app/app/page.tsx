import { redirect } from "next/navigation";
import { getSessionContext, homeFor } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Post-login resolver: applies a pending invitation (from sign-up) and routes by role. */
export default async function AppResolver() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pendingInvite = user?.user_metadata?.pending_invite as string | null | undefined;
  if (pendingInvite) {
    await supabase.auth.updateUser({ data: { pending_invite: null } });
    redirect(`/onboarding?invite=${encodeURIComponent(pendingInvite)}`);
  }
  redirect(homeFor(ctx));
}
