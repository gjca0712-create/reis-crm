import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-5", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>}
            {subtitle && <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
