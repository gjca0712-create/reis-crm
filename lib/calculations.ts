import { CASHBACK_RATE, POINTS_PER_REAL } from "./constants";

export function calcPoints(total: number) {
  return Math.floor(total * POINTS_PER_REAL);
}

export function calcCashback(total: number) {
  return Math.round(total * CASHBACK_RATE * 100) / 100;
}

export type RecencyBucket = "30" | "60" | "90" | "inativo" | "sem-compra";

export function daysSince(date: Date | string | null | undefined) {
  if (!date) return null;
  const ms = Date.now() - new Date(date).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function recencyBucket(lastPurchaseDate: Date | string | null | undefined): RecencyBucket {
  const days = daysSince(lastPurchaseDate);
  if (days === null) return "sem-compra";
  if (days <= 30) return "30";
  if (days <= 60) return "60";
  if (days <= 90) return "90";
  return "inativo";
}

export const RECENCY_LABELS: Record<RecencyBucket, string> = {
  "30": "Até 30 dias",
  "60": "Até 60 dias",
  "90": "Até 90 dias",
  inativo: "Inativo (90+ dias)",
  "sem-compra": "Sem compras",
};

export const RECENCY_STATUS: Record<RecencyBucket, "good" | "warning" | "serious" | "critical"> = {
  "30": "good",
  "60": "warning",
  "90": "serious",
  inativo: "critical",
  "sem-compra": "critical",
};

export const LEAD_STATUS_BADGE: Record<string, "good" | "warning" | "neutral" | "critical"> = {
  NOVO: "warning",
  CONTATADO: "neutral",
  CONVERTIDO: "good",
  PERDIDO: "critical",
};

// Quantos dias faltam pro próximo aniversário (0 = hoje), considerando só dia/mês.
export function daysUntilBirthday(birthday: Date | string | null | undefined): number | null {
  if (!birthday) return null;
  const b = new Date(birthday);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
