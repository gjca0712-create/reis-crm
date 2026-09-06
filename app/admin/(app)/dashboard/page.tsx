import Link from "next/link";
import { Wallet, Users, Gift, Percent } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrency, compactNumber, formatDate } from "@/lib/format";
import { recencyBucket, RECENCY_LABELS, RECENCY_STATUS, type RecencyBucket } from "@/lib/calculations";
import { dayKey, startOfDayNDaysAgo } from "@/lib/dates";
import { StatTile } from "@/components/ui/StatTile";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RevenueTrendChart } from "@/components/dashboard/RevenueTrendChart";
import { BairroRanking } from "@/components/dashboard/BairroRanking";
import { requireFeature } from "@/lib/session";

export default async function DashboardPage() {
  await requireFeature("dashboard");

  const since30 = startOfDayNDaysAgo(29);

  const [sales30, allCustomers, topPartners, recentSales] = await Promise.all([
    prisma.sale.findMany({
      where: { date: { gte: since30 } },
      select: { total: true, cashbackAmount: true, pointsEarned: true, date: true, customer: { select: { bairro: true } } },
    }),
    prisma.customer.findMany({
      select: {
        id: true,
        sales: { select: { date: true }, orderBy: { date: "desc" }, take: 1 },
      },
    }),
    prisma.partner.findMany({ orderBy: { cashbackBalance: "desc" }, take: 5 }),
    prisma.sale.findMany({
      orderBy: { date: "desc" },
      take: 8,
      include: { customer: { select: { name: true, bairro: true } }, partner: { select: { name: true } } },
    }),
  ]);

  const receita30 = sales30.reduce((sum, s) => sum + s.total, 0);
  const cashback30 = sales30.reduce((sum, s) => sum + s.cashbackAmount, 0);
  const pontos30 = sales30.reduce((sum, s) => sum + s.pointsEarned, 0);

  const bucketCounts: Record<RecencyBucket, number> = { "30": 0, "60": 0, "90": 0, inativo: 0, "sem-compra": 0 };
  for (const c of allCustomers) {
    bucketCounts[recencyBucket(c.sales[0]?.date ?? null)]++;
  }

  const dailyMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    dailyMap.set(dayKey(startOfDayNDaysAgo(i)), 0);
  }
  for (const s of sales30) {
    const key = dayKey(new Date(s.date));
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + s.total);
  }
  const trendData = Array.from(dailyMap.entries()).map(([date, value]) => ({ date, value }));

  const bairroMap = new Map<string, number>();
  for (const s of sales30) {
    bairroMap.set(s.customer.bairro, (bairroMap.get(s.customer.bairro) ?? 0) + s.total);
  }
  const bairroRanking = Array.from(bairroMap.entries())
    .map(([bairro, total]) => ({ bairro, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  const maxBairro = bairroRanking[0]?.total ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Dashboard</h1>
        <p className="text-sm text-ink-muted mt-0.5">Visão geral dos últimos 30 dias</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Receita (30 dias)" value={formatCurrency(receita30)} icon={Wallet} />
        <StatTile label="Clientes ativos" value={String(bucketCounts["30"])} icon={Users} />
        <StatTile label="Cashback gerado" value={formatCurrency(cashback30)} icon={Percent} />
        <StatTile label="Pontos emitidos" value={compactNumber(pontos30)} icon={Gift} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Receita por dia" subtitle="Últimos 30 dias" className="lg:col-span-2">
          <RevenueTrendChart data={trendData} />
        </Card>

        <Card title="Sinal de recência" subtitle="Última compra por cliente">
          <div className="space-y-2.5">
            {(["30", "60", "90", "inativo"] as RecencyBucket[]).map((bucket) => (
              <div key={bucket} className="flex items-center justify-between">
                <Badge status={RECENCY_STATUS[bucket]}>{RECENCY_LABELS[bucket]}</Badge>
                <span className="text-sm font-semibold text-ink-primary">{bucketCounts[bucket]}</span>
              </div>
            ))}
            {bucketCounts["sem-compra"] > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Badge status="neutral">{RECENCY_LABELS["sem-compra"]}</Badge>
                <span className="text-sm font-semibold text-ink-primary">{bucketCounts["sem-compra"]}</span>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Bairros que mais compram" subtitle="Receita nos últimos 30 dias (mapa de calor)" className="lg:col-span-2">
          <BairroRanking data={bairroRanking} max={maxBairro} />
          <div className="mt-3 text-right">
            <Link href="/admin/bairros" className="text-xs text-gold-400 hover:text-gold-300">
              Ver mapa completo →
            </Link>
          </div>
        </Card>

        <Card title="Top indicadores" subtitle="Saldo de cashback acumulado">
          <div className="space-y-1">
            {topPartners.map((p) => (
              <Link
                key={p.id}
                href={`/admin/indicadores/${p.id}`}
                className="flex items-center justify-between hover:bg-surface-raised rounded-lg px-2 py-1.5 -mx-2 transition-colors"
              >
                <span className="text-sm text-ink-secondary truncate">{p.name}</span>
                <span className="text-sm font-semibold text-gold-400 shrink-0">{formatCurrency(p.cashbackBalance)}</span>
              </Link>
            ))}
            {topPartners.length === 0 && <p className="text-sm text-ink-muted">Nenhum indicador cadastrado.</p>}
          </div>
        </Card>
      </div>

      <Card title="Vendas recentes">
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border">
                <th className="font-medium py-2 pr-4">Cliente</th>
                <th className="font-medium py-2 pr-4">Bairro</th>
                <th className="font-medium py-2 pr-4">Indicador</th>
                <th className="font-medium py-2 pr-4 text-right">Valor</th>
                <th className="font-medium py-2 text-right">Data</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-4 text-ink-primary">{s.customer.name}</td>
                  <td className="py-2.5 pr-4 text-ink-secondary">{s.customer.bairro}</td>
                  <td className="py-2.5 pr-4 text-ink-secondary">{s.partner?.name ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-right text-ink-primary tabular-nums">{formatCurrency(s.total)}</td>
                  <td className="py-2.5 text-right text-ink-muted tabular-nums">{formatDate(s.date)}</td>
                </tr>
              ))}
              {recentSales.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-ink-muted">
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
