import type { Prisma } from "@prisma/client";
import { onlyDigits } from "@/lib/format";
import { SECTORS } from "./sectors";
import { WHATSAPP_LINES } from "./lines";

// Filtros do WhatsApp Suporte (whatsapp/suporte/page.tsx), no formato do
// painel de atendimentos que a loja já conhecia: situação (em aberto ou
// finalizados — as conversas antigas), ordem da fila, departamentos (setores),
// atendentes e caixas de entrada (linhas), mais a busca nas mensagens. Lista
// vazia = todos.
// Ficam num cookie (SUPPORT_FILTERS_COOKIE), igual à aba e ao Meus/Equipe, pra
// sobreviver aos redirects das actions (responder, assumir, resolver). Um link
// com os filtros na URL (?situacao=finalizados&atendente=...) também funciona:
// a tela grava no cookie e limpa a URL.

export type SupportStatus = "abertos" | "finalizados";
export type SupportOrder = "atividade" | "chegada" | "criacao" | "finalizacao";

export const SUPPORT_STATUSES: { id: SupportStatus; label: string }[] = [
  { id: "abertos", label: "Em aberto" },
  { id: "finalizados", label: "Finalizados" },
];

// "Ordem de chegada": quem espera resposta há mais tempo fica em cima (as já
// respondidas vêm depois, da mais antiga pra mais nova) — atender na ordem.
const ORDERS: { id: SupportOrder; label: string; statuses: SupportStatus[] }[] = [
  { id: "atividade", label: "Última atividade", statuses: ["abertos", "finalizados"] },
  { id: "chegada", label: "Ordem de chegada", statuses: ["abertos"] },
  { id: "finalizacao", label: "Data de finalização", statuses: ["finalizados"] },
  { id: "criacao", label: "Data de criação", statuses: ["abertos", "finalizados"] },
];

export function ordersFor(status: SupportStatus): { id: SupportOrder; label: string }[] {
  return ORDERS.filter((o) => o.statuses.includes(status)).map(({ id, label }) => ({ id, label }));
}

// Departamento "Geral": conversa que nunca foi transferida pra um setor.
export const NO_SECTOR = "geral";

export const SUPPORT_FILTERS_COOKIE = "wa_suporte_filtros";

export type SupportFilters = {
  q: string;
  status: SupportStatus;
  order: SupportOrder;
  sectors: string[];
  agents: string[];
  lines: string[];
};

export type SupportFilterParams = {
  q?: string;
  situacao?: string;
  ordem?: string;
  setor?: string;
  atendente?: string;
  linha?: string;
};

const PARAM_KEYS: (keyof SupportFilterParams)[] = ["q", "situacao", "ordem", "setor", "atendente", "linha"];

export const DEFAULT_SUPPORT_FILTERS: SupportFilters = {
  q: "",
  status: "abertos",
  order: "atividade",
  sectors: [],
  agents: [],
  lines: [],
};

const SECTOR_OPTIONS = [...SECTORS.map((s) => s.id as string), NO_SECTOR];
const LINE_OPTIONS = WHATSAPP_LINES.map((l) => l.id as string);

function list(value: string | undefined, allowed?: string[]): string[] {
  const items = [...new Set((value ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 50);
  const valid = allowed ? items.filter((i) => allowed.includes(i)) : items;
  // Tudo marcado = sem filtro (e o botão volta a dizer "Todos").
  return allowed && valid.length === allowed.length ? [] : valid;
}

export function parseSupportFilters(params: SupportFilterParams): SupportFilters {
  const status = SUPPORT_STATUSES.find((s) => s.id === params.situacao)?.id ?? DEFAULT_SUPPORT_FILTERS.status;
  return {
    q: (params.q ?? "").trim().slice(0, 100),
    status,
    order: ordersFor(status).find((o) => o.id === params.ordem)?.id ?? DEFAULT_SUPPORT_FILTERS.order,
    sectors: list(params.setor, SECTOR_OPTIONS),
    agents: list(params.atendente),
    lines: list(params.linha, LINE_OPTIONS),
  };
}

// O cookie guarda a mesma query string da URL ("situacao=finalizados&setor=vendas").
export function parseSupportFiltersCookie(value: string | undefined): SupportFilters {
  return parseSupportFilters(Object.fromEntries(new URLSearchParams(value ?? "")));
}

// O link trouxe filtros na URL (ex.: das Métricas de atendimento)?
export function hasFilterParams(params: SupportFilterParams): boolean {
  return PARAM_KEYS.some((k) => params[k] !== undefined);
}

// "situacao=finalizados&setor=vendas,entregas" — só o que difere do padrão.
export function supportFiltersQuery(f: SupportFilters): string {
  const s = new URLSearchParams();
  if (f.q) s.set("q", f.q);
  if (f.status !== DEFAULT_SUPPORT_FILTERS.status) s.set("situacao", f.status);
  if (f.order !== DEFAULT_SUPPORT_FILTERS.order) s.set("ordem", f.order);
  if (f.sectors.length) s.set("setor", f.sectors.join(","));
  if (f.agents.length) s.set("atendente", f.agents.join(","));
  if (f.lines.length) s.set("linha", f.lines.join(","));
  return s.toString();
}

export function hasActiveFilters(f: SupportFilters): boolean {
  return supportFiltersQuery(f) !== "";
}

// O que vale pra quem está vendo. Finalizados (as conversas antigas) só pra
// CEO/Gerente; atendente fica sempre em "Em aberto". Filtro de atendente só
// onde aparecem conversas dos colegas: nos finalizados e na visão Equipe.
export function effectiveSupportFilters(
  f: SupportFilters,
  opts: { canSeeFinished: boolean; teamView: boolean }
): SupportFilters {
  const status = opts.canSeeFinished ? f.status : "abertos";
  const order = ordersFor(status).some((o) => o.id === f.order) ? f.order : DEFAULT_SUPPORT_FILTERS.order;
  const agents = opts.canSeeFinished && (status === "finalizados" || opts.teamView) ? f.agents : [];
  return { ...f, status, order, agents };
}

const MAX_INT = 2_147_483_647;

// Filtro no banco, somado ao da fila (queueListWhere). Situação, setores,
// linhas e busca valem pras duas colunas; atendente só pras conversas que já
// estão com alguém (a coluna Em espera continua mostrando quem espera).
export function supportFilterWhere(f: SupportFilters): Prisma.ConversationWhereInput {
  const and: Prisma.ConversationWhereInput[] = [
    f.status === "finalizados" ? { status: "RESOLVED" } : { status: { not: "RESOLVED" } },
  ];

  if (f.sectors.length) {
    const real = f.sectors.filter((s) => s !== NO_SECTOR);
    and.push({
      OR: [...(real.length ? [{ sector: { in: real } }] : []), ...(f.sectors.includes(NO_SECTOR) ? [{ sector: null }] : [])],
    });
  }

  if (f.agents.length) {
    and.push(
      f.status === "finalizados"
        ? { OR: [{ resolvedById: { in: f.agents } }, { assignedToId: { in: f.agents } }] }
        : { OR: [{ assignedToId: null }, { assignedToId: { in: f.agents } }] }
    );
  }

  if (f.lines.length) and.push({ line: { in: f.lines } });

  // Busca: número do atendimento (#123), nome, telefone ou texto de qualquer
  // mensagem da conversa (apagada pra todos não entra).
  if (f.q) {
    const digits = onlyDigits(f.q);
    const asNumber = /^#?\d{1,10}$/.test(f.q) ? Number(digits) : null;
    and.push({
      OR: [
        ...(asNumber !== null && asNumber <= MAX_INT ? [{ number: asNumber }] : []),
        { customer: { name: { contains: f.q, mode: "insensitive" } } },
        ...(digits.length >= 3 ? [{ customer: { phone: { contains: digits } } }] : []),
        { messages: { some: { deletedAt: null, body: { contains: f.q, mode: "insensitive" } } } },
      ],
    });
  }
  return { AND: and };
}

// Ordem no banco. "Ordem de chegada" depende de desde quando cada um espera
// resposta — o banco traz por última atividade e sortQueue reordena.
export function supportOrderBy(order: SupportOrder): Prisma.ConversationOrderByWithRelationInput[] {
  if (order === "criacao") return [{ createdAt: "desc" }];
  if (order === "finalizacao") return [{ resolvedAt: { sort: "desc", nulls: "last" } }, { lastMessageAt: "desc" }];
  if (order === "chegada") return [{ lastMessageAt: "asc" }];
  return [{ lastMessageAt: "desc" }];
}

export function sortQueue<T extends { waitingSince: Date | null; lastMessageAt: Date }>(
  conversations: T[],
  order: SupportOrder
): T[] {
  if (order !== "chegada") return conversations;
  return [...conversations].sort((a, b) => {
    if (a.waitingSince && b.waitingSince) return a.waitingSince.getTime() - b.waitingSince.getTime();
    if (a.waitingSince || b.waitingSince) return a.waitingSince ? -1 : 1;
    return a.lastMessageAt.getTime() - b.lastMessageAt.getTime();
  });
}

// Tempo curto da lista: "agora", "12min", "3h", "18d".
export function formatShortAgo(date: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
