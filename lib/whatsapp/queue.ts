import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageQueue } from "./message-permissions";

// Fila de atendimento do WhatsApp Suporte (whatsapp/suporte/page.tsx). Cada
// atendente vê só a própria fila: quem está esperando alguém assumir e as
// conversas que estão com ele. CEO e Gerente supervisionam tudo — inclusive as
// que estão com colegas e as finalizadas.
export type QueueSection = "waiting" | "mine" | "team" | "resolved";

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

// Ordem das seções na lista, de cima pra baixo.
export function visibleQueueSections(viewer: Viewer): QueueSection[] {
  return canManageQueue(viewer.role) ? ["waiting", "mine", "team", "resolved"] : ["waiting", "mine"];
}

// Resolvida nunca fica atribuída (resolveConversation solta), então o que
// sobra em aberto ou está livre (em espera) ou com alguém.
export function queueSection(conversation: QueuedConversation, userId: string): QueueSection {
  if (conversation.status === "RESOLVED") return "resolved";
  if (!conversation.assignedToId) return "waiting";
  return conversation.assignedToId === userId ? "mine" : "team";
}

// Filtro no banco equivalente a visibleQueueSections: quem não supervisiona
// nem carrega as finalizadas nem as dos colegas.
export function queueListWhere(viewer: Viewer): Prisma.ConversationWhereInput {
  if (canManageQueue(viewer.role)) return {};
  return { status: { not: "RESOLVED" }, OR: [{ assignedToId: null }, { assignedToId: viewer.userId }] };
}

export function groupByQueueSection<T extends QueuedConversation>(
  conversations: T[],
  viewer: Viewer
): { section: QueueSection; conversations: T[] }[] {
  return visibleQueueSections(viewer).map((section) => ({
    section,
    conversations: conversations.filter((c) => queueSection(c, viewer.userId) === section),
  }));
}

// A conversa que abre depois de concluir um atendimento: a primeira da fila na
// ordem da tela, sem contar as finalizadas (nem pra CEO/Gerente). null = fila vazia.
export async function firstInQueue(viewer: Viewer): Promise<string | null> {
  const open = await prisma.conversation.findMany({
    where: { AND: [queueListWhere(viewer), { status: { not: "RESOLVED" } }] },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, status: true, assignedToId: true },
  });
  return groupByQueueSection(open, viewer).flatMap((s) => s.conversations)[0]?.id ?? null;
}
