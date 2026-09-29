import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageQueue } from "./message-permissions";

// Fila de atendimento do WhatsApp Suporte (whatsapp/suporte/page.tsx). Cada
// usuário vê a própria fila: quem está esperando alguém assumir e as conversas
// que estão com ele — CEO e Gerente também. Eles podem trocar pra visão
// "Equipe" (supervisão), que mostra ainda as conversas com os colegas e as
// finalizadas.
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

type Viewer = { userId: string; role: string };
type QueuedConversation = { status: string; assignedToId: string | null };

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
  return { status: { not: "RESOLVED" }, OR: [{ assignedToId: null }, { assignedToId: viewer.userId }] };
}

export function groupByQueueSection<T extends QueuedConversation>(
  conversations: T[],
  viewer: Viewer,
  view: QueueView = "mine"
): { section: QueueSection; conversations: T[] }[] {
  return visibleQueueSections(viewer, view).map((section) => ({
    section,
    conversations: conversations.filter((c) => queueSection(c, viewer.userId) === section),
  }));
}

// A conversa que abre depois de concluir um atendimento: a primeira da fila na
// ordem da tela, sem contar as finalizadas. null = fila vazia.
export async function firstInQueue(viewer: Viewer, view: QueueView = "mine"): Promise<string | null> {
  const open = await prisma.conversation.findMany({
    where: { AND: [queueListWhere(viewer, view), { status: { not: "RESOLVED" } }] },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, status: true, assignedToId: true },
  });
  return groupByQueueSection(open, viewer, view).flatMap((s) => s.conversations)[0]?.id ?? null;
}
