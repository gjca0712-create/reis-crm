import type { Prisma } from "@prisma/client";
import { onlyDigits } from "@/lib/format";
import { SECTORS } from "./sectors";
import { WHATSAPP_LINES } from "./lines";

// Filtros da tela Mensagens antigas (whatsapp/antigas/page.tsx), no formato do
// painel de atendimentos que a loja já conhecia: situação, ordem, departamentos
// (setores), atendentes e caixas de entrada (linhas). Fica tudo na URL — dá pra
// mandar o link de uma busca pra alguém. Lista vazia = todos.

export type ArchiveStatus = "finalizados" | "abertos" | "todos";
export type ArchiveOrder = "atividade" | "criacao" | "finalizacao";

export const ARCHIVE_STATUSES: { id: ArchiveStatus; label: string }[] = [
  { id: "finalizados", label: "Finalizados" },
  { id: "abertos", label: "Em aberto" },
  { id: "todos", label: "Todos" },
];

export const ARCHIVE_ORDERS: { id: ArchiveOrder; label: string }[] = [
  { id: "atividade", label: "Última atividade" },
  { id: "criacao", label: "Data de criação" },
  { id: "finalizacao", label: "Data de finalização" },
];

// Departamento "Geral": conversa que nunca foi transferida pra um setor.
export const NO_SECTOR = "geral";
// Conversa que ninguém assumiu (só existe entre as em aberto).
export const NO_AGENT = "ninguem";

export type ArchiveFilters = {
  q: string;
  status: ArchiveStatus;
  order: ArchiveOrder;
  sectors: string[];
  agents: string[];
  lines: string[];
};

export type ArchiveParams = {
  q?: string;
  situacao?: string;
  ordem?: string;
  setor?: string;
  atendente?: string;
  linha?: string;
  p?: string;
  c?: string;
};

export const DEFAULT_ARCHIVE_FILTERS: ArchiveFilters = {
  q: "",
  status: "finalizados",
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

export function parseArchiveFilters(params: ArchiveParams): ArchiveFilters {
  return {
    q: (params.q ?? "").trim().slice(0, 100),
    status: ARCHIVE_STATUSES.find((s) => s.id === params.situacao)?.id ?? DEFAULT_ARCHIVE_FILTERS.status,
    order: ARCHIVE_ORDERS.find((o) => o.id === params.ordem)?.id ?? DEFAULT_ARCHIVE_FILTERS.order,
    sectors: list(params.setor, SECTOR_OPTIONS),
    agents: list(params.atendente),
    lines: list(params.linha, LINE_OPTIONS),
  };
}

export function hasActiveFilters(f: ArchiveFilters): boolean {
  return (
    Boolean(f.q) ||
    f.status !== DEFAULT_ARCHIVE_FILTERS.status ||
    f.order !== DEFAULT_ARCHIVE_FILTERS.order ||
    f.sectors.length > 0 ||
    f.agents.length > 0 ||
    f.lines.length > 0
  );
}

// "?situacao=abertos&setor=vendas,entregas&c=..." — só o que difere do padrão.
export function archiveQuery(f: ArchiveFilters, extra: { p?: number; c?: string } = {}): string {
  const s = new URLSearchParams();
  if (f.q) s.set("q", f.q);
  if (f.status !== DEFAULT_ARCHIVE_FILTERS.status) s.set("situacao", f.status);
  if (f.order !== DEFAULT_ARCHIVE_FILTERS.order) s.set("ordem", f.order);
  if (f.sectors.length) s.set("setor", f.sectors.join(","));
  if (f.agents.length) s.set("atendente", f.agents.join(","));
  if (f.lines.length) s.set("linha", f.lines.join(","));
  if (extra.p && extra.p > 1) s.set("p", String(extra.p));
  if (extra.c) s.set("c", extra.c);
  const query = s.toString();
  return query ? `?${query}` : "?";
}

const MAX_INT = 2_147_483_647;

export function archiveWhere(f: ArchiveFilters): Prisma.ConversationWhereInput {
  const and: Prisma.ConversationWhereInput[] = [];
  if (f.status === "finalizados") and.push({ status: "RESOLVED" });
  if (f.status === "abertos") and.push({ status: "OPEN" });

  if (f.sectors.length) {
    const real = f.sectors.filter((s) => s !== NO_SECTOR);
    and.push({
      OR: [...(real.length ? [{ sector: { in: real } }] : []), ...(f.sectors.includes(NO_SECTOR) ? [{ sector: null }] : [])],
    });
  }

  // Atendente da conversa: quem está com ela (em aberto) ou quem finalizou.
  if (f.agents.length) {
    const ids = f.agents.filter((a) => a !== NO_AGENT);
    and.push({
      OR: [
        ...(ids.length ? [{ assignedToId: { in: ids } }, { resolvedById: { in: ids } }] : []),
        ...(f.agents.includes(NO_AGENT) ? [{ assignedToId: null, resolvedById: null }] : []),
      ],
    });
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

export function archiveOrderBy(order: ArchiveOrder): Prisma.ConversationOrderByWithRelationInput[] {
  if (order === "criacao") return [{ createdAt: "desc" }];
  if (order === "finalizacao") return [{ resolvedAt: { sort: "desc", nulls: "last" } }, { lastMessageAt: "desc" }];
  return [{ lastMessageAt: "desc" }];
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
