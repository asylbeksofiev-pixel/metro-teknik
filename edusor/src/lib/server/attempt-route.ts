import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/** Resolves the signed-in user for an attempt API call. Ownership is enforced by RLS/RPC. */
export async function attemptRouteContext(params: Promise<{ id: string }>) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return { error: NextResponse.json({ error: "invalid" }, { status: 400 }) } as const;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  return { id, supabase, user } as const;
}

export function errorStatus(code: string) {
  return code === "forbidden" ? 403 : code === "unknown_question" || code === "response_too_large" ? 422 : 500;
}
