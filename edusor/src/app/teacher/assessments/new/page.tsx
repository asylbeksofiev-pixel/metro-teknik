import Link from "next/link";
import { FileText } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { teacherClasses } from "@/lib/data/teacher";
import { subjectName } from "@/lib/i18n/format";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { SimpleForm } from "@/components/forms/simple-form";
import { Button } from "@/components/ui/button";
import { createAssessmentAction } from "@/lib/actions/assessments";

export default async function NewAssessment({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const { classId } = await searchParams;
  const ctx = await requireRole("teacher");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const classes = await teacherClasses(supabase, ctx.userId);
  const { data: subjects } = await supabase.from("subjects").select("id, name_ru, name_kk").eq("school_id", ctx.schoolId!).order("name_ru");
  const preferred = classes.find((c) => c.id === classId)?.subjects[0]?.id;
  return (
    <>
      <PageHeader title={d.assessment.new} breadcrumb={<Link href="/teacher/assessments" className="hover:underline">{d.assessment.listTitle}</Link>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title={d.assessment.newManual} />
          <CardBody>
            <SimpleForm
              action={createAssessmentAction}
              submitLabel={d.common.create}
              columns={2}
              fields={[
                { name: "title", label: d.assessment.title, required: true, maxLength: 200 },
                { name: "kind", label: d.assessment.kindLabel, type: "select", required: true, options: [{ value: "sor", label: d.assessment.kind.sor }, { value: "soch", label: d.assessment.kind.soch }] },
                { name: "classId", label: d.common.class, type: "select", defaultValue: classId, options: classes.map((c) => ({ value: c.id, label: c.name })) },
                { name: "subjectId", label: d.common.subject, type: "select", defaultValue: preferred, options: (subjects ?? []).map((s) => ({ value: s.id, label: subjectName(s, locale) })) },
              ]}
            />
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader title={d.assessment.newFromDocument} description={d.documents.uploadHint} />
          <CardBody><Button asChild variant="secondary" className="w-full"><Link href="/teacher/documents"><FileText /> {d.documents.upload}</Link></Button></CardBody>
        </Card>
      </div>
    </>
  );
}
