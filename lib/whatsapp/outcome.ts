// Resultado do atendimento (Conversation.outcome): o atendente marca na
// conversa se o cliente comprou, pediu orçamento ou só tirou uma dúvida — e o
// relatório em Métricas mostra quem mais vendeu e com o que a loja está lidando.
// Sem dependência de servidor: usado pela tela, pela action e pelo relatório.

export const CONVERSATION_OUTCOMES = [
  { id: "VENDA", label: "Venda", plural: "Vendas", hint: "O cliente comprou", color: "#2DB89D" },
  { id: "ORCAMENTO", label: "Orçamento", plural: "Orçamentos", hint: "O cliente pediu orçamento", color: "#F08C4B" },
  { id: "INFORMACAO", label: "Informação", plural: "Informações", hint: "O cliente só tirou uma dúvida", color: "#B48CF2" },
] as const;
// As três cores foram escolhidas pra se distinguirem também pra quem é
// daltônico (e com o mesmo brilho, nenhuma "grita" mais que as outras).
// "Sem marcação" é cinza: não é um resultado, é a falta dele.
export const UNMARKED_COLOR = "#8F8471";

export type ConversationOutcome = (typeof CONVERSATION_OUTCOMES)[number]["id"];
export type OutcomeInfo = (typeof CONVERSATION_OUTCOMES)[number];

export function isConversationOutcome(value: unknown): value is ConversationOutcome {
  return CONVERSATION_OUTCOMES.some((o) => o.id === value);
}

export function outcomeInfo(value: string | null | undefined): OutcomeInfo | null {
  return CONVERSATION_OUTCOMES.find((o) => o.id === value) ?? null;
}

export type OutcomeCounts = Record<ConversationOutcome, number>;

export function emptyOutcomeCounts(): OutcomeCounts {
  return { VENDA: 0, ORCAMENTO: 0, INFORMACAO: 0 };
}

export function outcomeTotal(counts: OutcomeCounts): number {
  return counts.VENDA + counts.ORCAMENTO + counts.INFORMACAO;
}

// --- Orçamento → venda ------------------------------------------------------------
// Conversa marcada Orçamento vira um orçamento "ABERTO" com retorno agendado
// (aba Retornos do Suporte), até alguém marcar que virou venda ou não.

export const QUOTE_STATUSES = [
  { id: "ABERTO", label: "Em aberto" },
  { id: "VENDIDO", label: "Virou venda" },
  { id: "PERDIDO", label: "Não fechou" },
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]["id"];

export function isQuoteStatus(value: unknown): value is QuoteStatus {
  return QUOTE_STATUSES.some((s) => s.id === value);
}

// Por que o orçamento não virou venda — o relatório soma, pra loja saber o que
// mais faz perder venda.
export const QUOTE_LOST_REASONS = [
  { id: "PRECO", label: "Achou caro" },
  { id: "CONCORRENTE", label: "Comprou em outro lugar" },
  { id: "ADIOU", label: "Desistiu ou adiou a obra" },
  { id: "SEM_RESPOSTA", label: "Não respondeu mais" },
  { id: "OUTRO", label: "Outro motivo" },
] as const;
export type QuoteLostReason = (typeof QUOTE_LOST_REASONS)[number]["id"];

export function isQuoteLostReason(value: unknown): value is QuoteLostReason {
  return QUOTE_LOST_REASONS.some((r) => r.id === value);
}

export function quoteLostReasonLabel(value: string | null | undefined): string | null {
  return QUOTE_LOST_REASONS.find((r) => r.id === value)?.label ?? null;
}

export const FOLLOW_UP_OPTIONS = [
  { days: 1, label: "Amanhã" },
  { days: 2, label: "Em 2 dias" },
  { days: 3, label: "Em 3 dias" },
  { days: 7, label: "Em 1 semana" },
] as const;
// Ao marcar Orçamento: retorno no dia seguinte. Depois de chamar o cliente
// pelo retorno, o próximo fica pra 2 dias depois (se ainda estiver em aberto).
export const FIRST_FOLLOW_UP_DAYS = 1;
export const NEXT_FOLLOW_UP_DAYS = 2;

export function isFollowUpDays(value: unknown): value is number {
  return FOLLOW_UP_OPTIONS.some((o) => o.days === value);
}

const storeDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" });

// Retorno às 8h (horário da loja) do dia, N dias depois de hoje — o atendente
// já encontra na lista quando chega, em vez de só no fim da tarde. Domingo
// passa pra segunda. America/Bahia não tem horário de verão: 8h lá = 11h UTC.
export function followUpDate(days: number, now = new Date()): Date {
  const [y, m, d] = storeDate.format(now).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days, 11));
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

// "1.234,56", "1234,5", "R$ 1.500", "1500.90" → número. "" → null (sem valor).
// undefined = não deu pra entender.
export function parseMoney(raw: string): number | null | undefined {
  let s = raw.replace(/R\$|\s/gi, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return undefined;
  const value = Number(s);
  return value > 0 && value < 10_000_000 ? value : undefined;
}

// Mensagem pronta do retorno (o atendente edita antes de mandar). O CRM já põe
// o nome do atendente em cima (signAgentMessage). Cadastro sem nome (só o
// telefone) fica sem o "Oi, Fulano".
export function followUpMessage(customerName: string): string {
  const first = customerName.trim().split(/\s+/)[0] ?? "";
  const hello = first && /^\p{L}/u.test(first) ? `Oi, ${first}!` : "Oi!";
  return `${hello} Tudo bem? Passando pra saber se ficou alguma dúvida no orçamento que te mandamos. Quer que a gente já separe o material pra você?`;
}

const shortDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit" });
const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", weekday: "short" });

// "hoje", "amanhã", "qua., 18/11" — ou atrasado ("desde 14/11"), pelo dia da loja.
export function followUpLabel(date: Date, now = new Date()): { text: string; due: boolean; late: boolean } {
  const day = storeDate.format(date);
  const today = storeDate.format(now);
  const tomorrow = storeDate.format(new Date(now.getTime() + 86_400_000));
  if (day < today) return { text: `atrasado, era ${shortDate.format(date)}`, due: true, late: true };
  if (day === today) return { text: "hoje", due: true, late: false };
  if (day === tomorrow) return { text: "amanhã", due: false, late: false };
  return { text: `${weekday.format(date)}, ${shortDate.format(date)}`, due: false, late: false };
}

// 1234.5 → "1.234,50" (sem o "R$", pro campo de valor).
export function moneyInput(value: number | null): string {
  return value === null ? "" : value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
