"use client";

import { useTransition } from "react";
import { Package, Truck, CheckCircle2, type LucideIcon } from "lucide-react";
import { DELIVERY_STATUS_LABELS } from "@/lib/constants";
import { updateDeliveryStatus } from "@/app/(app)/vendas/actions";

const STATUS_ICON: Record<string, LucideIcon> = {
  SEPARACAO: Package,
  EM_ROTA: Truck,
  ENTREGUE: CheckCircle2,
};

export function DeliveryStatusSelect({ saleId, value }: { saleId: string; value: string }) {
  const [isPending, startTransition] = useTransition();
  const Icon = STATUS_ICON[value] ?? Package;

  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 text-ink-muted shrink-0" />
      <select
        defaultValue={value}
        disabled={isPending}
        onChange={(e) => startTransition(() => updateDeliveryStatus(saleId, e.target.value))}
        className="rounded-lg bg-page border border-border px-2 py-1.5 text-xs text-ink-secondary focus:outline-none focus:ring-2 focus:ring-gold-400/50 disabled:opacity-60"
      >
        {Object.entries(DELIVERY_STATUS_LABELS).map(([status, label]) => (
          <option key={status} value={status}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
