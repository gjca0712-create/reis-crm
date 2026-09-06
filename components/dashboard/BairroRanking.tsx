import { formatCurrency } from "@/lib/format";
import { heatColor } from "@/lib/chart-colors";

export function BairroRanking({ data, max }: { data: { bairro: string; total: number }[]; max: number }) {
  if (data.length === 0) {
    return <p className="text-sm text-ink-muted">Sem vendas no período.</p>;
  }

  return (
    <div className="space-y-3">
      {data.map((row) => {
        const ratio = max > 0 ? row.total / max : 0;
        const pct = Math.max(ratio * 100, 4);
        return (
          <div key={row.bairro}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-ink-secondary">{row.bairro}</span>
              <span className="text-ink-primary font-medium tabular-nums">{formatCurrency(row.total)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-raised overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: heatColor(ratio) }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
