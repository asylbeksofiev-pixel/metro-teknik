import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export async function audit(event: {
  actorId: string | null;
  schoolId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_events").insert({
    actor_id: event.actorId,
    school_id: event.schoolId,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId ?? null,
    metadata: (event.metadata ?? {}) as { [key: string]: Json },
  });
  if (error) console.error("[audit] insert failed", error.message);
}

export async function logSystemError(source: string, message: string, context: Record<string, unknown> = {}) {
  console.error(`[${source}]`, message, context);
  try {
    const admin = createAdminClient();
    await admin.from("system_errors").insert({ source, message: message.slice(0, 2000), context: context as { [key: string]: Json } });
  } catch {
    // Logging must never throw.
  }
}
