// Períodos das telas do ERP (Financeiro, Produtos) sempre no fuso da LOJA, não
// do servidor: o Railway roda em UTC, e sem isso uma venda das 22h na Bahia
// cairia no dia seguinte (lib/dates.ts usa o fuso do servidor). A Bahia não tem
// horário de verão desde 2012 — UTC-3 fixo, então 00:00 na loja = 03:00 UTC.
export const STORE_TIMEZONE = "America/Bahia";
const STORE_UTC_OFFSET_HOURS = 3;

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "YYYY-MM-DD" do dia (na loja) em que esse instante cai.
export function storeDayKey(date: Date): string {
  return ymdFormatter.format(date);
}

// Instante (UTC) em que começa, na loja, o dia de `daysAgo` dias atrás.
// storeDayStart(0) = hoje 00:00; storeDayStart(-1) = amanhã 00:00.
export function storeDayStart(daysAgo: number): Date {
  const [y, m, d] = storeDayKey(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - daysAgo, STORE_UTC_OFFSET_HOURS));
}

export const ERP_PERIODS = [
  { value: "7", label: "7 dias", days: 7 },
  { value: "30", label: "30 dias", days: 30 },
  { value: "90", label: "90 dias", days: 90 },
  { value: "365", label: "12 meses", days: 365 },
] as const;

export type ErpPeriod = {
  value: string;
  label: string;
  days: number;
  // [start, end) do período atual, incluindo hoje inteiro.
  start: Date;
  end: Date;
  // Período anterior pra comparação (↑/↓ nos números), cortado no MESMO ponto
  // em que o atual está agora: hoje ainda está pela metade, então comparar com
  // dias fechados daria queda falsa (segunda 8h da manhã: -15% "vs semana passada").
  prevStart: Date;
  prevEnd: Date;
  granularity: "day" | "month";
};

// Instante (UTC) em que começa, na loja, o dia 1 do mês `monthsAgo` meses atrás.
function storeMonthStart(monthsAgo: number): Date {
  const [y, m] = storeDayKey(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 - monthsAgo, 1, STORE_UTC_OFFSET_HOURS));
}

const DAY_MS = 86_400_000;

export function resolvePeriod(raw: string | undefined, fallback = "30"): ErpPeriod {
  const p = ERP_PERIODS.find((x) => x.value === raw) ?? ERP_PERIODS.find((x) => x.value === fallback)!;
  const end = storeDayStart(-1);
  const now = Date.now();

  // "12 meses" = mês atual + 11 meses fechados antes dele (não "365 dias pra
  // trás"), senão o 1º mês do gráfico mensal entraria cortado pela metade.
  if (p.days > 90) {
    // Comparação: os mesmos meses 1 ano antes, até este mesmo instante 1 ano atrás.
    const prevEnd = new Date(now);
    prevEnd.setUTCFullYear(prevEnd.getUTCFullYear() - 1);
    return {
      value: p.value,
      label: p.label,
      days: p.days,
      start: storeMonthStart(11),
      end,
      prevStart: storeMonthStart(23),
      prevEnd,
      granularity: "month",
    };
  }

  // Sem horário de verão na Bahia: "N dias atrás" é sempre N × 24h.
  const start = storeDayStart(p.days - 1);
  return {
    value: p.value,
    label: p.label,
    days: p.days,
    start,
    end,
    prevStart: storeDayStart(2 * p.days - 1),
    prevEnd: new Date(now - p.days * DAY_MS),
    granularity: "day",
  };
}

// Todas as chaves do período (dia "YYYY-MM-DD" ou mês "YYYY-MM"), em ordem —
// pra o gráfico mostrar dia/mês sem venda como zero, em vez de pular.
export function periodKeys(period: ErpPeriod): string[] {
  if (period.granularity === "day") {
    return Array.from({ length: period.days }, (_, i) => storeDayKey(storeDayStart(period.days - 1 - i)));
  }
  const [y, m] = storeDayKey(new Date()).split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (11 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}
