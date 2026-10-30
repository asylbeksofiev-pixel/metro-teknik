export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T): ActionResult<T>;
export function ok(): ActionResult<undefined>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: string, fieldErrors?: Record<string, string>): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  return { ok: false, error, fieldErrors };
}

/** Extracts a known error code (raised by our SQL functions) from a Postgres/PostgREST error. */
export function dbErrorCode(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return "generic";
  const msg = error.message ?? "";
  if (/^[a-z_]+$/.test(msg)) return msg;
  if (error.code === "42501" || /row-level security/i.test(msg)) return "forbidden";
  return "generic";
}
