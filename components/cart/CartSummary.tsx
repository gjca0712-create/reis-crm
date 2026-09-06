import type { ReactNode } from "react";
import { formatBRL } from "@/lib/cart";

export default function CartSummary({
  subtotal,
  itemCount,
  children,
}: {
  subtotal: number;
  itemCount: number;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-surface-container p-6">
      <h2 className="font-display text-lg font-semibold">Resumo</h2>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-on-background/60">Itens</dt>
          <dd>{itemCount}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <dt>Total estimado</dt>
          <dd className="text-primary">{formatBRL(subtotal)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-on-background/50">
        Valor sujeito à confirmação de disponibilidade e frete.
      </p>
      {children}
    </div>
  );
}
