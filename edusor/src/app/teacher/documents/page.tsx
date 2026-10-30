import Link from "next/link";
import { FileText } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { subjectName, formatDateTime } from "@/lib/i18n/format";
import { aiConfigured } from "@/lib/ai/client";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DocumentUploadForm } from "@/components/documents/upload-form";
import { AutoRefresh } from "@/components/documents/auto-refresh";

const TONE = { uploaded: "neutral", processing: "info", extracting_text: "info", generating_questions: "info", review_required: "warning", completed: "success", failed: "danger" } as const;

export default async function Documents() {
  const ctx = await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const [{ data: jobs }, { data: subjects }] = await Promise.all([
    supabase.from("ocr_jobs").select("id, file_name, status, created_at, page_count").eq("created_by", ctx.userId).order("created_at", { ascending: false }).limit(50),
    supabase.from("subjects").select("name_ru, name_kk").eq("school_id", ctx.schoolId!).order("name_ru"),
  ]);
  const running = (jobs ?? []).some((j) => ["uploaded", "processing", "extracting_text", "generating_questions"].includes(j.status));
  return (
    <>
      <PageHeader title={d.documents.title} />
      <AutoRefresh active={running} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title={d.documents.upload} />
          <CardBody><DocumentUploadForm subjects={(subjects ?? []).map((s) => subjectName(s, locale))} aiReady={aiConfigured()} /></CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader title={d.documents.recent} />
          <CardBody className="p-0">
            {!jobs?.length ? <EmptyState icon={FileText} title={d.documents.noDocuments} /> : (
              <ul className="divide-y divide-border">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <Link href={`/teacher/documents/${j.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{j.file_name}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(j.created_at, locale)}</span>
                      </span>
                      <Badge tone={TONE[j.status]}>{d.documents.statuses[j.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
