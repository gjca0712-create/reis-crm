export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

// Fuso da loja (Cruz das Almas, Bahia) — sem isso, o Intl.DateTimeFormat usa o
// fuso do container (Railway roda em UTC), mostrando toda data/hora 3h à frente
// do horário real da Bahia.
const STORE_TIMEZONE = "America/Bahia";

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: STORE_TIMEZONE,
  }).format(new Date(date));
}

export function formatBirthday(date: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: STORE_TIMEZONE }).format(
    new Date(date)
  );
}

export function formatDateTime(date: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: STORE_TIMEZONE,
  }).format(new Date(date));
}

// --- Hora das mensagens (telas de conversa, estilo WhatsApp) ---

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: STORE_TIMEZONE });
// en-CA dá AAAA-MM-DD: chave do dia no fuso da loja, pra comparar "hoje/ontem".
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: STORE_TIMEZONE });

// "14:32"
export function formatTime(date: Date | string) {
  return timeFormat.format(new Date(date));
}

// Dias de calendário (no fuso da loja) entre a data e agora: 0 = hoje, 1 = ontem.
function daysAgo(date: Date | string, now: Date) {
  const day = (d: Date) => Date.parse(dayKeyFormat.format(d));
  return Math.round((day(now) - day(new Date(date))) / 86_400_000);
}

// Separador de dia no meio da conversa: "Hoje", "Ontem" ou "02/10/2026".
export function formatDayLabel(date: Date | string, now = new Date()) {
  const days = daysAgo(date, now);
  return days === 0 ? "Hoje" : days === 1 ? "Ontem" : formatDate(date);
}

// Hora na lista de conversas: "14:32" (hoje), "Ontem" ou "02/10/2026".
export function formatListTime(date: Date | string, now = new Date()) {
  const days = daysAgo(date, now);
  return days === 0 ? formatTime(date) : days === 1 ? "Ontem" : formatDate(date);
}

// Há quanto tempo o cliente espera resposta: "agora", "12 min", "1 h 05 min", "3 dias".
export function formatWaitingTime(since: Date | string, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${String(minutes % 60).padStart(2, "0")} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} dia${days === 1 ? "" : "s"}`;
}

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatPhone(value: string) {
  const digits = onlyDigits(value);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

export function whatsappLink(phone: string, message?: string) {
  const digits = onlyDigits(phone);
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  const base = `https://wa.me/${withCountry}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function compactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
