"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { fail, type ActionResult } from "./result";

export async function markAllReadAction(): Promise<ActionResult> {
  const ctx = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.userId).is("read_at", null);
  if (error) return fail("generic");
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
