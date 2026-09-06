import { heatColor } from "@/lib/chart-colors";

export function OccurrenceTypeRanking({ data, max }: { data: { type: string; label: string; count: number }[]; max: number }) {
  if (data.length === 0) {
    return <p className="text-sm text-ink-muted">Nenhuma ocorrência registrada neste período.</p>;
  }

  return (
    <div className="space-y-3">
      {data.map((row) => {
        const ratio = max > 0 ? row.count / max : 0;
        const pct = Math.max(ratio * 100, 4);
        return (
          <div key={row.type}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-ink-secondary">{row.label}</span>
              <span className="text-ink-primary font-medium tabular-nums">{row.count}</span>
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
