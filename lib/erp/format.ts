// Formatação específica das telas do ERP (percentual, variação vs período anterior).

const pctFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compactMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const qtyFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export function formatPct(value: number) {
  return `${pctFormatter.format(value)}%`;
}

// "R$ 92,3 mil" — pra textos de apoio, onde o valor exato atrapalha a leitura.
export function formatMoneyCompact(value: number) {
  return compactMoney.format(value);
}

export function formatQty(value: number, unidade?: string | null) {
  return `${qtyFormatter.format(value)}${unidade ? ` ${unidade.toLowerCase()}` : ""}`;
}

type Delta = { delta?: string; deltaDirection?: "up" | "down" };

// Variação percentual vs período anterior, no formato do StatTile. Sem base
// no período anterior (zero), não mostra nada em vez de um "+∞%".
export function pctDelta(current: number, previous: number): Delta {
  if (previous <= 0) return {};
  const change = ((current - previous) / previous) * 100;
  return {
    delta: `${formatPct(Math.abs(change))} vs período anterior`,
    deltaDirection: change >= 0 ? "up" : "down",
  };
}

// Variação em pontos percentuais (pra margem: 27% -> 29% é +2 p.p., não +7%).
export function ppDelta(current: number, previous: number, hasPrevious: boolean): Delta {
  if (!hasPrevious) return {};
  const change = current - previous;
  return {
    delta: `${pctFormatter.format(Math.abs(change))} p.p. vs período anterior`,
    deltaDirection: change >= 0 ? "up" : "down",
  };
}
