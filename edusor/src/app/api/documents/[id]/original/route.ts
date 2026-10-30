import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/** Redirects to a short-lived signed URL of the original document. RLS decides access. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new NextResponse("Bad request", { status: 400 });
  const supabase = await createClient();
  const { data: job } = await supabase.from("ocr_jobs").select("storage_path").eq("id", id).maybeSingle();
  if (!job) return new NextResponse("Not found", { status: 404 });
  const { data } = await supabase.storage.from("assessment-documents").createSignedUrl(job.storage_path, 300);
  if (!data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
