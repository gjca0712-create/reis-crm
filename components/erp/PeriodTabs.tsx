import { ERP_PERIODS } from "@/lib/erp/period";

// Mesmo visual do filtro de período da tela Bairros. `extraParams` mantém os
// outros filtros da página (ex.: ordenação) ao trocar de período.
export function PeriodTabs({
  basePath,
  current,
  extraParams = {},
}: {
  basePath: string;
  current: string;
  extraParams?: Record<string, string>;
}) {
  return (
    <div className="flex gap-1.5 bg-surface border border-border rounded-lg p-1">
      {ERP_PERIODS.map((p) => {
        const qs = new URLSearchParams({ ...extraParams, periodo: p.value });
        return (
          <a
            key={p.value}
            href={`${basePath}?${qs.toString()}`}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              current === p.value ? "bg-gold-400 text-page" : "text-ink-secondary hover:text-ink-primary"
            }`}
          >
            {p.label}
          </a>
        );
      })}
    </div>
  );
}
