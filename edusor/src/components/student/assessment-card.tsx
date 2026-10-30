import Link from "next/link";
import { Clock, CalendarClock } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n/config";
import { formatDateTime, subjectName } from "@/lib/i18n/format";
import { STATUS_TONE } from "@/lib/assessment/status";
import type { StudentAssessmentRow } from "@/lib/data/student";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/utils";

export function StudentAssessmentCard({ a, d, locale }: { a: StudentAssessmentRow; d: Dictionary; locale: Locale }) {
  const action =
    a.status === "in_progress" && a.latest ? { href: `/student/attempts/${a.latest.id}`, label: d.attempt.continue }
    : a.canStart ? { href: `/student/assessments/${a.id}/instructions`, label: d.attempt.start }
    : a.latest && a.status === "released" ? { href: `/student/results/${a.latest.id}`, label: d.results.title }
    : null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{d.assessment.kind[a.kind]}</Badge>
          <span className="text-xs text-muted-foreground">{subjectName(a.subject, locale)}</span>
        </div>
        <p className="mt-1.5 truncate text-[15px] font-medium">{a.title}</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />
            {a.status === "upcoming" ? fmt(d.student.opensAt, { date: formatDateTime(a.starts_at, locale) }) : a.due_at ? fmt(d.student.deadline, { date: formatDateTime(a.due_at, locale) }) : d.student.noDeadline}
          </span>
          {a.duration_minutes && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{a.duration_minutes} {d.common.minutes}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Badge tone={STATUS_TONE[a.status]}>{d.status[a.status]}</Badge>
        {action && <Button asChild size="sm" variant={a.status === "released" ? "secondary" : "primary"}><Link href={action.href}>{action.label}</Link></Button>}
      </div>
    </div>
  );
}
