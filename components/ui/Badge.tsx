import type { ReactNode } from "react";
import { CheckCircle2, AlertTriangle, AlertOctagon, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type BadgeStatus = "good" | "warning" | "serious" | "critical" | "neutral";

const STATUS_STYLES: Record<BadgeStatus, { bg: string; text: string; border: string; icon: LucideIcon | null }> = {
  good: { bg: "bg-status-good/10", text: "text-status-good", border: "border-status-good/30", icon: CheckCircle2 },
  warning: { bg: "bg-status-warning/10", text: "text-status-warning", border: "border-status-warning/30", icon: AlertTriangle },
  serious: { bg: "bg-status-serious/10", text: "text-status-serious", border: "border-status-serious/30", icon: AlertOctagon },
  critical: { bg: "bg-status-critical/10", text: "text-status-critical", border: "border-status-critical/30", icon: XCircle },
  neutral: { bg: "bg-surface-raised", text: "text-ink-secondary", border: "border-border-strong", icon: null },
};

// Status color is never the only signal — every badge ships an icon + label together.
export function Badge({
  status = "neutral",
  children,
  className,
}: {
  status?: BadgeStatus;
  children: ReactNode;
  className?: string;
}) {
  const style = STATUS_STYLES[status];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        style.bg,
        style.text,
        style.border,
        className
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />}
      {children}
    </span>
  );
}
