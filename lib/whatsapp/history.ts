import { prisma } from "@/lib/prisma";
import type { EarlierConversation } from "@/components/whatsapp/ChatTimeline";
import { whatsappLineLabel } from "./lines";

// Atendimentos anteriores do mesmo cliente, pra aparecerem em cima da conversa
// aberta (ChatTimeline). Cada Resolvido fecha um atendimento e o cliente que
// volta abre outro — sem isso, quem atende hoje não via o orçamento de ontem.
// Qualquer um que pode abrir a conversa atual vê o histórico dela (a lista de
// Finalizados continua só CEO/Gerente). Em qualquer linha da loja.
export const EARLIER_STEP = 3;
export const EARLIER_MAX = 30;
const MESSAGES_PER_CONVERSATION = 80;

export function earlierCount(raw: string | undefined): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? Math.min(n, EARLIER_MAX) : EARLIER_STEP;
}

export async function loadEarlierConversations(
  current: { id: string; customerId: string; createdAt: Date; line: string },
  count: number
): Promise<{ conversations: EarlierConversation[]; more: number }> {
  const where = { customerId: current.customerId, id: { not: current.id }, createdAt: { lt: current.createdAt } };
  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: count,
      select: {
        id: true,
        number: true,
        line: true,
        status: true,
        resolvedAt: true,
        resolvedBy: { select: { name: true } },
        // As mais novas primeiro pra cortar nas últimas N; desvira embaixo.
        messages: {
          orderBy: { createdAt: "desc" },
          take: MESSAGES_PER_CONVERSATION,
          include: { sender: { select: { name: true } } },
        },
        transfers: {
          orderBy: { createdAt: "asc" },
          include: { byUser: { select: { name: true } }, toUser: { select: { name: true } } },
        },
      },
    }),
    prisma.conversation.count({ where }),
  ]);

  const conversations = rows.reverse().map((c) => {
    const messages = [...c.messages].reverse();
    const truncated = c.messages.length === MESSAGES_PER_CONVERSATION;
    // Cortou: transferência de antes da primeira mensagem que aparece fica de fora.
    const from = truncated ? messages[0]?.createdAt : undefined;
    return {
      id: c.id,
      number: c.number,
      status: c.status,
      resolvedAt: c.resolvedAt,
      resolvedBy: c.resolvedBy,
      lineLabel: c.line !== current.line ? whatsappLineLabel(c.line) : undefined,
      messages,
      transfers: from ? c.transfers.filter((t) => t.createdAt >= from) : c.transfers,
      truncated,
    };
  });
  return { conversations, more: Math.max(0, total - rows.length) };
}
