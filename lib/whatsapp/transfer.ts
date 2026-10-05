import { prisma } from "@/lib/prisma";
import { queueBlockReason, type QueueViewer } from "./queue";
import { isSectorId, sectorLabel, TRANSFER_REASON_MIN } from "./sectors";

// Transferir uma conversa pra outro setor: sai de quem estava com ela e vai
// pra fila de espera do setor escolhido, com o motivo registrado no meio da
// conversa (ConversationTransfer). A server action (suporte/actions.ts) só
// confere a permissão e escolhe a próxima conversa da fila.
export async function transferConversationAs(
  viewer: QueueViewer,
  conversationId: string,
  sector: string,
  rawReason: string
): Promise<{ ok: true } | { error: string }> {
  const reason = rawReason.trim();
  if (!isSectorId(sector)) return { error: "Escolha o setor." };
  if (reason.length < TRANSFER_REASON_MIN) {
    return { error: `Descreva o motivo (pelo menos ${TRANSFER_REASON_MIN} letras) — o setor precisa entender o caso.` };
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true, assignedToId: true, sector: true },
  });
  if (!conversation) return { error: "Conversa não encontrada." };
  if (conversation.status !== "OPEN") return { error: "Essa conversa já foi finalizada." };
  const blocked = queueBlockReason(viewer, conversation);
  if (blocked) {
    return {
      error:
        blocked === "outro-setor"
          ? "Essa conversa já foi transferida pra outro setor."
          : "Essa conversa foi assumida por outro atendente.",
    };
  }
  if (conversation.sector === sector) return { error: `A conversa já está com ${sectorLabel(sector)}.` };

  // Condicional (mesmo dono e setor de quando conferiu): se alguém assumiu ou
  // transferiu nesse meio-tempo, não passa por cima.
  const moved = await prisma.$transaction(async (tx) => {
    const updated = await tx.conversation.updateMany({
      where: { id: conversationId, status: "OPEN", assignedToId: conversation.assignedToId, sector: conversation.sector },
      data: { sector, assignedToId: null },
    });
    if (updated.count === 0) return false;
    await tx.conversationTransfer.create({
      data: { conversationId, fromSector: conversation.sector, toSector: sector, reason, byUserId: viewer.userId },
    });
    return true;
  });
  if (!moved) {
    return { error: "A conversa mudou nesse meio-tempo (alguém assumiu ou transferiu). Confira e tente de novo." };
  }
  return { ok: true };
}
