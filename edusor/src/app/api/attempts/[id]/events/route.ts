import { NextResponse } from "next/server";
import { z } from "zod";
import { attemptRouteContext } from "@/lib/server/attempt-route";

const EVENT_TYPES = [
  "fullscreen_exit", "fullscreen_enter", "visibility_hidden", "visibility_visible", "window_blur", "window_focus",
  "copy_blocked", "paste_blocked", "cut_blocked", "context_menu_blocked", "print_blocked", "devtools_shortcut",
  "connection_lost", "connection_restored",
] as const;

const body = z.object({
  events: z.array(z.object({
    type: z.enum(EVENT_TYPES),
    clientTime: z.string().datetime().optional(),
    durationMs: z.number().int().min(0).max(24 * 3600 * 1000).optional(),
    metadata: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
  })).min(1).max(50),
});

/** Records lockdown events. RLS only allows the owner of an in-progress attempt to insert. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await attemptRouteContext(params);
  if ("error" in ctx) return ctx.error;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { data: attempt } = await ctx.supabase.from("attempts").select("assessment_id, status").eq("id", ctx.id).maybeSingle();
  if (!attempt) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (attempt.status !== "in_progress") return NextResponse.json({ ok: false, reason: "locked" });
  const { error } = await ctx.supabase.from("lockdown_events").insert(
    parsed.data.events.map((e) => ({
      attempt_id: ctx.id,
      assessment_id: attempt.assessment_id,
      student_id: ctx.user.id,
      event_type: e.type,
      client_time: e.clientTime ?? null,
      duration_ms: e.durationMs ?? null,
      metadata: e.metadata ?? {},
    })),
  );
  if (error) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
