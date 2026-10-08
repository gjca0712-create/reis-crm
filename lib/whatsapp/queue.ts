import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageQueue } from "./message-permissions";
import { needsReply } from "./closing";

// Fila de atendimento do WhatsApp Suporte (whatsapp/suporte/page.tsx). Cada
// usuário vê a própria fila: quem está esperando alguém assumir e as conversas
// que estão com ele — CEO e Gerente também. Eles podem trocar pra visão
// "Equipe" (supervisão), que mostra ainda as conversas com os colegas e as
// finalizadas.
// Setores (lib/whatsapp/sectors.ts): conversa transferida pra um setor só
// aparece em "Em espera" pra quem é dele (e pra CEO/Gerente). Sem setor
// (entrada geral, toda conversa nova) aparece pra todo mundo.
export type QueueSection = "waiting" | "mine" | "team" | "resolved";

// "mine" = a fila da pessoa (padrão, e a única pra quem não supervisiona);
// "team" = tudo, só pra CEO/Gerente.
export type QueueView = "mine" | "team";

// Cookie com a visão escolhida (Meus/Equipe) — cookie e não parâmetro na URL
// pra sobreviver aos redirects das actions (responder, assumir, resolver).
export const QUEUE_VIEW_COOKIE = "wa_suporte_visao";

export function parseQueueView(value: string | undefined): QueueView {
  return value === "team" ? "team" : "mine";
}

export const QUEUE_SECTION_LABELS: Record<QueueSection, string> = {
  waiting: "Em espera",
  mine: "Com você",
  team: "Com a equipe",
  resolved: "Finalizadas",
};

// Mensagem de seção vazia (só nas seções da fila — as outras somem vazias).
export const QUEUE_SECTION_EMPTY: Partial<Record<QueueSection, string>> = {
  waiting: "Ninguém esperando.",
  mine: "Nenhuma conversa com você.",
};

// sector: setor de quem está vendo (User.sector) — ver loadQueueViewer.
export type QueueViewer = { userId: string; role: string; sector?: string | null };
type Viewer = QueueViewer;
type QueuedConversation = { status: string; assignedToId: string | null; sector?: string | null };

// Setor da pessoa logada (não vai no token da sessão: o CEO pode trocar o
// setor de alguém a qualquer hora e tem que valer na hora).
export async function loadQueueViewer(session: { userId: string; role: string }): Promise<QueueViewer> {
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { sector: true } });
  return { userId: session.userId, role: session.role, sector: user?.sector ?? null };
}

// Conversa em espera de um setor: só o próprio setor (e CEO/Gerente) enxerga.
export function canSeeWaiting(viewer: Viewer, sector: string | null | undefined): boolean {
  return canManageQueue(viewer.role) || !sector || sector === viewer.sector;
}

function waitingWhere(viewer: Viewer): Prisma.ConversationWhereInput {
  if (canManageQueue(viewer.role)) return {};
  return viewer.sector ? { OR: [{ sector: null }, { sector: viewer.sector }] } : { sector: null };
}

// Por que essa pessoa não pode mexer na conversa (responder, assumir,
// resolver, transferir) — null = pode. A tela já esconde; as actions conferem
// de novo, porque a tela só atualiza a cada 12s.
export function queueBlockReason(
  viewer: Viewer,
  conversation: QueuedConversation
): "assumida-por-outro" | "outro-setor" | null {
  if (canManageQueue(viewer.role)) return null;
  if (conversation.assignedToId && conversation.assignedToId !== viewer.userId) return "assumida-por-outro";
  if (!conversation.assignedToId && conversation.status !== "RESOLVED" && !canSeeWaiting(viewer, conversation.sector)) {
    return "outro-setor";
  }
  return null;
}

// Visão "Equipe" só vale pra quem supervisiona; pros outros é sempre a própria fila.
export function seesWholeTeam(viewer: Viewer, view: QueueView): boolean {
  return view === "team" && canManageQueue(viewer.role);
}

// Ordem das seções na lista, de cima pra baixo.
export function visibleQueueSections(viewer: Viewer, view: QueueView = "mine"): QueueSection[] {
  return seesWholeTeam(viewer, view) ? ["waiting", "mine", "team", "resolved"] : ["waiting", "mine"];
}

// Resolvida nunca fica atribuída (resolveConversation solta), então o que
// sobra em aberto ou está livre (em espera) ou com alguém.
export function queueSection(conversation: QueuedConversation, userId: string): QueueSection {
  if (conversation.status === "RESOLVED") return "resolved";
  if (!conversation.assignedToId) return "waiting";
  return conversation.assignedToId === userId ? "mine" : "team";
}

// Filtro no banco equivalente a visibleQueueSections: na própria fila nem
// carrega as finalizadas nem as dos colegas.
export function queueListWhere(viewer: Viewer, view: QueueView = "mine"): Prisma.ConversationWhereInput {
  if (seesWholeTeam(viewer, view)) return {};
  return {
    status: { not: "RESOLVED" },
    OR: [{ assignedToId: viewer.userId }, { AND: [{ assignedToId: null }, waitingWhere(viewer)] }],
  };
}

export function groupByQueueSection<T extends QueuedConversation>(
  conversations: T[],
  viewer: Viewer,
  view: QueueView = "mine"
): { section: QueueSection; conversations: T[] }[] {
  return visibleQueueSections(viewer, view).map((section) => ({
    section,
    conversations: conversations.filter(
      (c) => queueSection(c, viewer.userId) === section && (section !== "waiting" || canSeeWaiting(viewer, c.sector))
    ),
  }));
}

// A conversa que abre depois de concluir um atendimento: a primeira da fila na
// ordem da tela, sem contar as finalizadas. null = fila vazia. skipId: a que
// acabou de sair (transferida) — CEO/Gerente ainda a veem na espera.
export async function firstInQueue(viewer: Viewer, view: QueueView = "mine", skipId?: string): Promise<string | null> {
  const open = await prisma.conversation.findMany({
    where: {
      AND: [queueListWhere(viewer, view), { status: { not: "RESOLVED" } }, ...(skipId ? [{ id: { not: skipId } }] : [])],
    },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, status: true, assignedToId: true, sector: true },
  });
  return groupByQueueSection(open, viewer, view).flatMap((s) => s.conversations)[0]?.id ?? null;
}

// Aba "Sem resposta +4h": clientes esperando resposta há mais de 4 horas,
// estejam em espera ou já com alguém — o mais antigo primeiro. A escolha da aba
// fica num cookie (igual ao Meus/Equipe), pra sobreviver ao Resolvido/próxima.
export const OVERDUE_MS = 4 * 60 * 60_000;
export type QueueTab = "fila" | "atrasadas";
export const QUEUE_TAB_COOKIE = "wa_suporte_aba";

export function parseQueueTab(value: string | undefined): QueueTab {
  return value === "atrasadas" ? "atrasadas" : "fila";
}

// Desde quando cada conversa espera resposta: a primeira mensagem do cliente
// depois da nossa última (apagada pra todos não conta). Calculado no banco —
// a lista só carrega as 10 últimas mensagens, e quem mandou mais que isso
// seguido estaria esperando há mais tempo do que elas mostram.
export async function unansweredSince(conversationIds: string[]): Promise<Map<string, Date>> {
  if (conversationIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ id: string; since: Date }[]>`
    SELECT m."conversationId" AS id, MIN(m."createdAt") AS since
    FROM "Message" m
    WHERE m."conversationId" IN (${Prisma.join(conversationIds)})
      AND m.direction = 'IN'
      AND m."deletedAt" IS NULL
      AND m."createdAt" > COALESCE(
        (SELECT MAX(o."createdAt") FROM "Message" o
          WHERE o."conversationId" = m."conversationId" AND o.direction = 'OUT' AND o."deletedAt" IS NULL),
        to_timestamp(0)
      )
    GROUP BY m."conversationId"
  `;
  return new Map(rows.map((r) => [r.id, r.since]));
}

type WithMessages = {
  id: string;
  status: string;
  messages: { direction: string; body: string | null; mediaType?: string | null }[];
};

// Põe waitingSince (desde quando espera resposta, ou null) em cada conversa.
export async function withWaitingSince<T extends WithMessages>(conversations: T[]): Promise<(T & { waitingSince: Date | null })[]> {
  const waiting = conversations.filter((c) => c.status !== "RESOLVED" && needsReply(c.messages[0]));
  const since = await unansweredSince(waiting.map((c) => c.id));
  return conversations.map((c) => ({ ...c, waitingSince: since.get(c.id) ?? null }));
}

export function overdueConversations<T extends { waitingSince: Date | null }>(conversations: T[], now: Date): T[] {
  return conversations
    .filter((c) => c.waitingSince && now.getTime() - c.waitingSince.getTime() >= OVERDUE_MS)
    .sort((a, b) => a.waitingSince!.getTime() - b.waitingSince!.getTime());
}
