import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from "@/lib/constants";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { DeliveryStatusSelect } from "@/components/sales/DeliveryStatusSelect";
import { requireFeature } from "@/lib/session";

export default async function VendasPage({ searchParams }: { searchParams: Promise<{ entrega?: string }> }) {
  await requireFeature("vendas");

  const params = await searchParams;
  const entregaFilter = (params.entrega ?? "") as DeliveryStatus | "";

  const sales = await prisma.sale.findMany({
    where: entregaFilter ? { deliveryStatus: entregaFilter } : {},
    orderBy: { date: "desc" },
    take: 100,
    include: {
      customer: { select: { id: true, name: true, bairro: true } },
      partner: { select: { id: true, name: true } },
      items: { select: { productName: true } },
    },
  });

  const totalPeriodo = sales.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Vendas</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {sales.length} venda{sales.length === 1 ? "" : "s"} · total {formatCurrency(totalPeriodo)}
          </p>
        </div>
        <LinkButton href="/vendas/novo">
          <Plus className="w-4 h-4" /> Registrar venda
        </LinkButton>
      </div>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <label htmlFor="entrega" className="block text-xs text-ink-muted mb-1.5">
              Status da entrega
            </label>
            <select
              id="entrega"
              name="entrega"
              defaultValue={entregaFilter}
              className="w-full rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-gold-400/50"
            >
              <option value="">Todas</option>
              {Object.entries(DELIVERY_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-gold-400 text-page font-medium text-sm px-5 py-2.5 hover:bg-gold-300 transition-colors"
          >
            Filtrar
          </button>
          {entregaFilter && (
            <Link href="/vendas" className="text-sm text-ink-muted hover:text-ink-primary px-2 py-2.5">
              Limpar
            </Link>
          )}
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border bg-surface-raised/40">
                <th className="font-medium py-3 px-5">Data</th>
                <th className="font-medium py-3 px-4">Cliente</th>
                <th className="font-medium py-3 px-4">Itens</th>
                <th className="font-medium py-3 px-4">Bairro</th>
                <th className="font-medium py-3 px-4">Indicador</th>
                <th className="font-medium py-3 px-4">Entrega</th>
                <th className="font-medium py-3 px-4 text-right">Valor</th>
                <th className="font-medium py-3 px-4 text-right">Pontos</th>
                <th className="font-medium py-3 px-4 text-right">Cashback</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0 hover:bg-surface-raised/40">
                  <td className="py-3 px-5 text-ink-muted tabular-nums">{formatDate(s.date)}</td>
                  <td className="py-3 px-4">
                    <Link href={`/clientes/${s.customer.id}`} className="text-ink-primary font-medium hover:text-gold-400">
                      {s.customer.name}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-ink-secondary">
                    {s.items[0]?.productName ?? "—"}
                    {s.items.length > 1 ? ` +${s.items.length - 1}` : ""}
                  </td>
                  <td className="py-3 px-4 text-ink-secondary">{s.customer.bairro}</td>
                  <td className="py-3 px-4 text-ink-secondary">
                    {s.partner ? (
                      <Link href={`/indicadores/${s.partner.id}`} className="hover:text-gold-400">
                        {s.partner.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <DeliveryStatusSelect saleId={s.id} value={s.deliveryStatus} />
                  </td>
                  <td className="py-3 px-4 text-right text-ink-primary font-medium tabular-nums">{formatCurrency(s.total)}</td>
                  <td className="py-3 px-4 text-right text-gold-400 tabular-nums">+{s.pointsEarned}</td>
                  <td className="py-3 px-4 text-right text-ink-secondary tabular-nums">
                    {s.cashbackAmount > 0 ? formatCurrency(s.cashbackAmount) : "—"}
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-ink-muted">
                    Nenhuma venda registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
