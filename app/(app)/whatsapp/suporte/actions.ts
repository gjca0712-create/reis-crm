"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/session";
import { startWhatsAppConnection, disconnectWhatsApp } from "@/lib/whatsapp/client";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";

export async function connectWhatsAppAction() {
  await requireFeature("whatsapp_suporte");
  await startWhatsAppConnection();
  revalidatePath("/whatsapp/suporte");
}

export async function disconnectWhatsAppAction() {
  await requireFeature("whatsapp_suporte");
  await disconnectWhatsApp();
  revalidatePath("/whatsapp/suporte");
}

// Envia de verdade se a conexão WhatsApp Web estiver ativa; sempre registra a
// mensagem internamente, com o atendente logado como remetente.
export async function sendSupportReply(conversationId: string, formData: FormData) {
  const body = String(formData.get("body") || "").trim();
  if (!body) return;

  const session = await requireFeature("whatsapp_suporte");
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true },
  });
  if (!conversation) return;

  await sendWhatsAppMessage(conversation.customer.phone, body);

  await prisma.$transaction([
    prisma.message.create({
      data: { conversationId, direction: "OUT", body, senderId: session?.userId },
    }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
  ]);

  revalidatePath("/whatsapp/suporte");
}

// Marca a conversa como resolvida, credita o atendente e dispara o pedido de
// avaliação (1 a 5) pro cliente via WhatsApp.
export async function resolveConversation(conversationId: string) {
  const session = await requireFeature("whatsapp_suporte");

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true },
  });
  if (!conversation) return;

  const ratingMessage = "Como você avalia nosso atendimento? Responda com um número de 1 a 5. Muito obrigado! 🙏";
  const sent = await sendWhatsAppMessage(conversation.customer.phone, ratingMessage);

  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "RESOLVED", resolvedById: session.userId, ratingRequested: true },
    }),
    ...(sent
      ? [
          prisma.message.create({
            data: { conversationId, direction: "OUT", body: ratingMessage, senderId: session.userId },
          }),
        ]
      : []),
  ]);

  revalidatePath("/whatsapp/suporte");
}
