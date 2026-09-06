import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatDate } from "@/lib/format";
import { OCCURRENCE_TYPE_LABELS, type OccurrenceType } from "@/lib/constants";
import { monthKey, monthRange } from "@/lib/dates";
import { StatTile } from "@/components/ui/StatTile";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { OccurrenceTypeRanking } from "@/components/occurrences/OccurrenceTypeRanking";
import { requireFeature } from "@/lib/session";

export default async function OcorrenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; tipo?: string }>;
}) {
  await requireFeature("ocorrencias");

  const params = await searchParams;
  const mes = params.mes && /^\d{4}-\d{2}$/.test(params.mes) ? params.mes : monthKey(new Date());
  const tipoFilter = (params.tipo ?? "") as OccurrenceType | "";
  const { start, end } = monthRange(mes);

  const occurrences = await prisma.occurrence.findMany({
    where: { createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, name: true } },
      sale: { select: { id: true, date: true } },
      reportedBy: { select: { name: true } },
    },
  });

  const countsByType = new Map<string, number>();
  for (const o of occurrences) {
    countsByType.set(o.type, (countsByType.get(o.type) ?? 0) + 1);
  }
  const typeRanking = Object.entries(OCCURRENCE_TYPE_LABELS)
    .map(([type, label]) => ({ type, label, count: countsByType.get(type) ?? 0 }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxCount = typeRanking[0]?.count ?? 0;

  const rows = tipoFilter ? occurrences.filter((o) => o.type === tipoFilter) : occurrences;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Ocorrências</h1>
          <p className="text-sm text-ink-muted mt-0.5">Registro de erros operacionais e relatório mensal por tipo</p>
        </div>
        <LinkButton href="/ocorrencias/novo">
          <Plus className="w-4 h-4" /> Registrar ocorrência
        </LinkButton>
      </div>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="mes" className="block text-xs text-ink-muted mb-1.5">
              Mês
            </label>
            <input
              id="mes"
              type="month"
              name="mes"
              defaultValue={mes}
              className="rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-gold-400/50"
            />
          </div>
          <div className="min-w-[220px]">
            <label htmlFor="tipo" className="block text-xs text-ink-muted mb-1.5">
              Tipo
            </label>
            <select
              id="tipo"
              name="tipo"
              defaultValue={tipoFilter}
              className="w-full rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-gold-400/50"
            >
              <option value="">Todos</option>
              {Object.entries(OCCURRENCE_TYPE_LABELS).map(([value, label]) => (
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
          {tipoFilter && (
            <Link href={`/ocorrencias?mes=${mes}`} className="text-sm text-ink-muted hover:text-ink-primary px-2 py-2.5">
              Limpar tipo
            </Link>
          )}
        </form>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatTile label="Ocorrências no mês" value={String(occurrences.length)} className="lg:col-span-1" />
        <Card title="Ocorrências por tipo" subtitle="Quantidade no mês selecionado" className="lg:col-span-2">
          <OccurrenceTypeRanking data={typeRanking} max={maxCount} />
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border bg-surface-raised/40">
                <th className="font-medium py-3 px-5">Data</th>
                <th className="font-medium py-3 px-4">Tipo</th>
                <th className="font-medium py-3 px-4">Cliente</th>
                <th className="font-medium py-3 px-4">Venda</th>
                <th className="font-medium py-3 px-4">Descrição</th>
                <th className="font-medium py-3 px-4">Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-border/60 last:border-0 hover:bg-surface-raised/40">
                  <td className="py-3 px-5 text-ink-muted tabular-nums whitespace-nowrap">{formatDateTime(o.createdAt)}</td>
                  <td className="py-3 px-4 text-ink-primary font-medium">{OCCURRENCE_TYPE_LABELS[o.type] ?? o.type}</td>
                  <td className="py-3 px-4 text-ink-secondary">
                    {o.customer ? (
                      <Link href={`/clientes/${o.customer.id}`} className="hover:text-gold-400">
                        {o.customer.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3 px-4 text-ink-secondary">
                    {o.sale ? `Compra #${o.sale.id.slice(-6)} · ${formatDate(o.sale.date)}` : "—"}
                  </td>
                  <td className="py-3 px-4 text-ink-secondary max-w-xs truncate" title={o.description ?? undefined}>
                    {o.description ?? "—"}
                  </td>
                  <td className="py-3 px-4 text-ink-secondary">{o.reportedBy?.name ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-ink-muted">
                    Nenhuma ocorrência registrada neste período.
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
