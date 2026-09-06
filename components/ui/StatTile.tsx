import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function StatTile({
  label,
  value,
  delta,
  deltaDirection = "up",
  deltaIsGood = true,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: "up" | "down";
  deltaIsGood?: boolean;
  icon?: LucideIcon;
  className?: string;
}) {
  const deltaColor = delta ? ((deltaDirection === "up") === deltaIsGood ? "text-status-good" : "text-status-critical") : undefined;

  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-5", className)}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-ink-secondary">{label}</span>
        {Icon && (
          <span className="w-8 h-8 rounded-lg bg-gold-400/10 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-gold-400" strokeWidth={2} />
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold text-ink-primary">{value}</div>
      {delta && (
        <div className={cn("text-xs mt-1.5 font-medium", deltaColor)}>
          {deltaDirection === "up" ? "↑" : "↓"} {delta}
        </div>
      )}
    </div>
  );
}
