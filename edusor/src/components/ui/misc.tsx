import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, breadcrumb }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1 text-[13px] text-muted-foreground">{breadcrumb}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-[22px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, hint, tone = "primary" }: { label: string; value: ReactNode; icon?: LucideIcon; hint?: ReactNode; tone?: "primary" | "success" | "warning" | "danger" | "info" }) {
  const tones = {
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
  };
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-card">
      {Icon && (
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", tones[tone])}>
          <Icon className="size-[18px]" aria-hidden />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[13px] text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      {Icon && (
        <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-md text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const alertStyles = {
  info: { cls: "border-info/20 bg-info-soft text-info", Icon: Info },
  success: { cls: "border-success/20 bg-success-soft text-success", Icon: CheckCircle2 },
  warning: { cls: "border-warning/25 bg-warning-soft text-warning", Icon: AlertTriangle },
  danger: { cls: "border-danger/20 bg-danger-soft text-danger", Icon: XCircle },
};

export function Alert({ tone = "info", title, children, className }: { tone?: keyof typeof alertStyles; title?: ReactNode; children?: ReactNode; className?: string }) {
  const { cls, Icon } = alertStyles[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-2.5 rounded-md border px-3.5 py-3 text-[13px]", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-foreground/90">
        {title && <p className="font-medium text-foreground">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden />;
}

export function ProgressBar({ value, max = 100, className, tone = "primary" }: { value: number; max?: number; className?: string; tone?: "primary" | "success" | "warning" | "danger" }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const colors = { primary: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-danger" };
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width]", colors[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
