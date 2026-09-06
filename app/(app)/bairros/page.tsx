import { MapPin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { startOfDayNDaysAgo } from "@/lib/dates";
import { heatColor } from "@/lib/chart-colors";
import { Card } from "@/components/ui/Card";
import { requireFeature } from "@/lib/session";

const PERIODS = [
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "12 meses" },
  { value: "all", label: "Todo período" },
];

export default async function BairrosPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await requireFeature("bairros");

  const params = await searchParams;
  const periodo = PERIODS.some((p) => p.value === params.periodo) ? params.periodo! : "90";

  const where = periodo === "all" ? {} : { date: { gte: startOfDayNDaysAgo(Number(periodo) - 1) } };

  const [sales, customersByBairro] = await Promise.all([
    prisma.sale.findMany({ where, select: { total: true, customer: { select: { bairro: true } } } }),
    prisma.customer.groupBy({ by: ["bairro"], _count: { _all: true } }),
  ]);

  const customerCounts = new Map(customersByBairro.map((c) => [c.bairro, c._count._all]));

  const statsMap = new Map<string, { total: number; vendas: number }>();
  for (const s of sales) {
    const bairro = s.customer.bairro;
    const current = statsMap.get(bairro) ?? { total: 0, vendas: 0 };
    current.total += s.total;
    current.vendas += 1;
    statsMap.set(bairro, current);
  }
  for (const bairro of customerCounts.keys()) {
    if (!statsMap.has(bairro)) statsMap.set(bairro, { total: 0, vendas: 0 });
  }

  const rows = Array.from(statsMap.entries())
    .map(([bairro, stats]) => ({
      bairro,
      total: stats.total,
      vendas: stats.vendas,
      clientes: customerCounts.get(bairro) ?? 0,
      ticketMedio: stats.vendas > 0 ? stats.total / stats.vendas : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const maxTotal = rows[0]?.total ?? 0;
  const totalGeral = rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Bairros</h1>
          <p className="text-sm text-ink-muted mt-0.5">Mapa de calor de vendas por bairro</p>
        </div>
        <div className="flex gap-1.5 bg-surface border border-border rounded-lg p-1">
          {PERIODS.map((p) => (
            <a
              key={p.value}
              href={`/bairros?periodo=${p.value}`}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                periodo === p.value ? "bg-gold-400 text-page" : "text-ink-secondary hover:text-ink-primary"
              }`}
            >
              {p.label}
            </a>
          ))}
        </div>
      </div>

      <Card title="Mapa de calor" subtitle={`Receita por bairro · ${formatCurrency(totalGeral)} no período`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {rows.map((r) => {
            const ratio = maxTotal > 0 ? r.total / maxTotal : 0;
            return (
              <div
                key={r.bairro}
                className="rounded-xl p-4 border border-border-strong/50"
                style={{ backgroundColor: `${heatColor(ratio)}1A` }}
              >
                <div className="flex items-center gap-1.5 text-xs text-ink-secondary mb-2">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{r.bairro}</span>
                </div>
                <div className="text-lg font-semibold text-ink-primary">{formatCurrency(r.total)}</div>
                <div className="text-xs text-ink-muted mt-1">
                  {r.vendas} venda{r.vendas === 1 ? "" : "s"} · {r.clientes} cliente{r.clientes === 1 ? "" : "s"}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-sm text-ink-muted col-span-full">Nenhum dado de bairro ainda.</p>}
        </div>
      </Card>

      <Card title="Ranking detalhado" className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border bg-surface-raised/40">
                <th className="font-medium py-3 px-5">Bairro</th>
                <th className="font-medium py-3 px-4 text-right">Clientes</th>
                <th className="font-medium py-3 px-4 text-right">Vendas</th>
                <th className="font-medium py-3 px-4 text-right">Ticket médio</th>
                <th className="font-medium py-3 px-4 text-right">Receita</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.bairro} className="border-b border-border/60 last:border-0 hover:bg-surface-raised/40">
                  <td className="py-3 px-5 text-ink-primary font-medium">{r.bairro}</td>
                  <td className="py-3 px-4 text-right text-ink-secondary tabular-nums">{r.clientes}</td>
                  <td className="py-3 px-4 text-right text-ink-secondary tabular-nums">{r.vendas}</td>
                  <td className="py-3 px-4 text-right text-ink-secondary tabular-nums">{formatCurrency(r.ticketMedio)}</td>
                  <td className="py-3 px-4 text-right text-gold-400 font-semibold tabular-nums">{formatCurrency(r.total)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ink-muted">
                    Nenhum dado de bairro ainda.
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
