export type BarRow = {
  label: string;
  value: number;
  display: string; // valor já formatado (R$, %, etc.)
  detail?: string; // texto menor ao lado do rótulo
  color?: string;
};

// Ranking em barras horizontais (formas de pagamento, vendedores, grupos...).
// Barra proporcional ao maior valor da lista; cor padrão dourada.
export function BarList({ rows, empty = "Sem dados no período." }: { rows: BarRow[]; empty?: string }) {
  if (rows.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 0);

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const pct = max > 0 ? Math.max((row.value / max) * 100, row.value > 0 ? 3 : 0) : 0;
        return (
          <div key={row.label}>
            <div className="flex items-center justify-between gap-3 text-sm mb-1">
              <span className="text-ink-secondary truncate">
                {row.label}
                {row.detail && <span className="text-ink-muted text-xs"> · {row.detail}</span>}
              </span>
              <span className="text-ink-primary font-medium tabular-nums shrink-0">{row.display}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-raised overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: row.color ?? "#D4AF37" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
