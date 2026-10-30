import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Serves question images from the private bucket. Storage RLS decides access (school members only). */
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path") ?? "";
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(path)) return new NextResponse("Bad request", { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("question-media").createSignedUrl(path, 300);
  if (error || !data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, max-age=240" } });
}
