import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/constants";
import { resolveFeatures } from "@/lib/permissions";
import { queueBlockReason, type QueueViewer } from "./queue";
import { isSectorId, sectorLabel, TRANSFER_REASON_MIN } from "./sectors";

// Transferir uma conversa, com o motivo registrado no meio da conversa
// (ConversationTransfer):
// - pra outro setor: sai de quem estava com ela e vai pra fila de espera do setor;
// - pra um atendente: já chega assumida por ele (aparece em "Com você" dele).
// A server action (suporte/actions.ts) só confere a permissão e escolhe a
// próxima conversa da fila.
export type TransferOutcome = { ok: true } | { error: string };

type Transferable = { status: string; assignedToId: string | null; sector: string | null };

function reasonError(reason: string): string | null {
  return reason.length < TRANSFER_REASON_MIN
    ? `Descreva o motivo (pelo menos ${TRANSFER_REASON_MIN} letras) — quem recebe precisa entender o caso.`
    : null;
}

async function loadTransferable(
  viewer: QueueViewer,
  conversationId: string
): Promise<{ conversation: Transferable } | { error: string }> {
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
  return { conversation };
}

// Grava a mudança só se a conversa ainda está como estava quando conferiu (mesmo
// dono e setor): se alguém assumiu ou transferiu nesse meio-tempo, não passa por cima.
async function moveConversation(
  viewer: QueueViewer,
  conversationId: string,
  from: Transferable,
  to: { sector: string | null; assignedToId: string | null },
  reason: string
): Promise<TransferOutcome> {
  const moved = await prisma.$transaction(async (tx) => {
    const updated = await tx.conversation.updateMany({
      where: { id: conversationId, status: "OPEN", assignedToId: from.assignedToId, sector: from.sector },
      data: { sector: to.sector, assignedToId: to.assignedToId },
    });
    if (updated.count === 0) return false;
    await tx.conversationTransfer.create({
      data: {
        conversationId,
        fromSector: from.sector,
        toSector: to.sector,
        toUserId: to.assignedToId,
        reason,
        byUserId: viewer.userId,
      },
    });
    return true;
  });
  return moved
    ? { ok: true }
    : { error: "A conversa mudou nesse meio-tempo (alguém assumiu ou transferiu). Confira e tente de novo." };
}

export async function transferConversationAs(
  viewer: QueueViewer,
  conversationId: string,
  sector: string,
  rawReason: string
): Promise<TransferOutcome> {
  const reason = rawReason.trim();
  if (!isSectorId(sector)) return { error: "Escolha o setor." };
  const invalid = reasonError(reason);
  if (invalid) return { error: invalid };

  const loaded = await loadTransferable(viewer, conversationId);
  if ("error" in loaded) return loaded;
  const { conversation } = loaded;
  if (conversation.sector === sector) return { error: `A conversa já está com ${sectorLabel(sector)}.` };

  return moveConversation(viewer, conversationId, conversation, { sector, assignedToId: null }, reason);
}

// Pra um atendente: a conversa passa pro setor dele (se ele tiver um), pra que,
// se ele liberar, ela caia na fila do setor dele e não na de quem transferiu.
export async function transferToAgentAs(
  viewer: QueueViewer,
  conversationId: string,
  toUserId: string,
  rawReason: string
): Promise<TransferOutcome> {
  const reason = rawReason.trim();
  if (!toUserId) return { error: "Escolha o atendente." };
  if (toUserId === viewer.userId) return { error: "Pra ficar com a conversa, use Assumir atendimento." };
  const invalid = reasonError(reason);
  if (invalid) return { error: invalid };

  const target = await prisma.user.findUnique({
    where: { id: toUserId },
    select: { name: true, role: true, sector: true, featureOverrides: true },
  });
  if (!target || !resolveFeatures(target.role as Role, target.featureOverrides).includes("whatsapp_suporte")) {
    return { error: "Esse atendente não tem acesso ao WhatsApp Suporte." };
  }

  const loaded = await loadTransferable(viewer, conversationId);
  if ("error" in loaded) return loaded;
  const { conversation } = loaded;
  if (conversation.assignedToId === toUserId) return { error: `A conversa já está com ${target.name}.` };

  return moveConversation(
    viewer,
    conversationId,
    conversation,
    { sector: target.sector ?? conversation.sector, assignedToId: toUserId },
    reason
  );
}

// Quem aparece na lista "Para um atendente": todo usuário com acesso ao Suporte,
// com quantas conversas em aberto já estão com ele (pra dividir o trabalho).
export type TransferAgent = { id: string; name: string; sector: string | null; openCount: number };

export async function transferAgents(): Promise<TransferAgent[]> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      role: true,
      sector: true,
      featureOverrides: true,
      _count: { select: { assignedConversations: { where: { status: "OPEN" } } } },
    },
    orderBy: { name: "asc" },
  });
  return users
    .filter((u) => resolveFeatures(u.role as Role, u.featureOverrides).includes("whatsapp_suporte"))
    .map((u) => ({ id: u.id, name: u.name, sector: u.sector, openCount: u._count.assignedConversations }));
}
