import Link from "next/link";
import { ClipboardList, FileText, Plus } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, subjectName } from "@/lib/i18n/format";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/forms/search-input";
import { UrlSelect } from "@/components/forms/url-select";

const STATUSES = ["draft", "published", "closed", "archived"] as const;

export default async function TeacherAssessments({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const sp = await searchParams;
  await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  let query = supabase
    .from("assessments")
    .select("id, title, kind, status, due_at, updated_at, class:classes(name), subject:subjects(name_ru, name_kk), attempts(count)")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (sp.status && (STATUSES as readonly string[]).includes(sp.status)) query = query.eq("status", sp.status as (typeof STATUSES)[number]);
  else query = query.neq("status", "archived");
  if (sp.q?.trim()) query = query.ilike("title", `%${sp.q.trim().replace(/[%_]/g, "")}%`);
  const { data: rows } = await query;

  return (
    <>
      <PageHeader
        title={d.assessment.listTitle}
        actions={
          <>
            <Button asChild variant="secondary"><Link href="/teacher/documents"><FileText /> {d.assessment.newFromDocument}</Link></Button>
            <Button asChild><Link href="/teacher/assessments/new"><Plus /> {d.assessment.new}</Link></Button>
          </>
        }
      />
      <Card>
        <CardHeader title={`${d.assessment.listTitle} (${rows?.length ?? 0})`} action={<div className="flex flex-wrap gap-2"><SearchInput placeholder={d.common.search} /><UrlSelect param="status" label={d.assessment.filterStatus} allLabel={d.common.all} options={STATUSES.map((s) => ({ value: s, label: d.status[s] }))} /></div>} />
        <CardBody className="p-0">
          {!rows?.length ? <EmptyState icon={ClipboardList} title={d.assessment.noAssessments} /> : (
            <Table>
              <THead><TR><TH>{d.assessment.title}</TH><TH>{d.assessment.kindLabel}</TH><TH>{d.common.class}</TH><TH>{d.common.subject}</TH><TH>{d.assessment.dueAt}</TH><TH>{d.assessment.submissions}</TH><TH>{d.common.status}</TH></TR></THead>
              <TBody>
                {rows.map((a) => (
                  <TR key={a.id}>
                    <TD><Link href={`/teacher/assessments/${a.id}`} className="font-medium hover:text-primary hover:underline">{a.title}</Link></TD>
                    <TD>{d.assessment.kind[a.kind]}</TD>
                    <TD>{a.class?.name ?? "—"}</TD>
                    <TD>{subjectName(a.subject, locale)}</TD>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(a.due_at, locale)}</TD>
                    <TD className="tabular-nums">{a.attempts[0]?.count ?? 0}</TD>
                    <TD><Badge tone={a.status === "published" ? "success" : a.status === "draft" ? "neutral" : "info"}>{d.status[a.status]}</Badge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}
