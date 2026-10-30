import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { liveDataAction } from "@/lib/actions/live";
import { PageHeader } from "@/components/ui/misc";
import { LiveMonitor } from "@/components/live/live-monitor";
import { fmt } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("teacher");
  const { d } = await getI18n();
  const supabase = await createClient();
  const { data: a } = await supabase.from("assessments").select("title").eq("id", id).maybeSingle();
  if (!a) notFound();
  const initial = await liveDataAction(id);
  if (!initial.ok) notFound();
  return (
    <>
      <PageHeader title={fmt(d.live.title, { title: a.title })} breadcrumb={<Link href={`/teacher/assessments/${id}`} className="hover:underline">{a.title}</Link>} />
      <LiveMonitor assessmentId={id} initial={initial.data} />
    </>
  );
}
