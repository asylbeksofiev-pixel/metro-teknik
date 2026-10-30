import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { detectFileType, EXT } from "@/lib/server/files";
import { rateLimit } from "@/lib/server/rate-limit";

const MAX = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const ctx = await getSessionContext();
  const membership = ctx?.memberships.find((m) => m.role === "teacher" || m.role === "school_admin");
  if (!ctx || !membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await rateLimit(`media:${ctx.userId}`, 60, 3600))) return NextResponse.json({ error: "rateLimited" }, { status: 429 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "fileTooLarge" }, { status: 413 });
  const buf = new Uint8Array(await file.arrayBuffer());
  const type = detectFileType(buf);
  if (type !== "image/png" && type !== "image/jpeg" && type !== "image/webp") return NextResponse.json({ error: "fileType" }, { status: 415 });

  const path = `${membership.school_id}/${randomUUID()}.${EXT[type]}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from("question-media").upload(path, buf, { contentType: type, upsert: false });
  if (error) return NextResponse.json({ error: "uploadFailed" }, { status: 500 });
  return NextResponse.json({ path });
}
