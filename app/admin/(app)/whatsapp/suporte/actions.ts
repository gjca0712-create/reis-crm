"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/session";
import { startWhatsAppConnection, disconnectWhatsApp } from "@/lib/whatsapp/client";
import { sendWhatsAppMessage, sendWhatsAppMedia } from "@/lib/whatsapp/send";
import { isWhatsAppLineId, toWhatsAppLineId } from "@/lib/whatsapp/lines";
import { saveMediaBuffer, mediaCategoryFromMimetype } from "@/lib/whatsapp/media";

export async function connectWhatsAppAction(line: string) {
  await requireFeature("whatsapp_suporte");
  if (!isWhatsAppLineId(line)) return;
  await startWhatsAppConnection(line);
  revalidatePath("/admin/whatsapp/suporte");
}

export async function disconnectWhatsAppAction(line: string) {
  await requireFeature("whatsapp_suporte");
  if (!isWhatsAppLineId(line)) return;
  await disconnectWhatsApp(line);
  revalidatePath("/admin/whatsapp/suporte");
}

// Envia de verdade se a conexão WhatsApp Web estiver ativa; sempre registra a
// mensagem internamente, com o atendente logado como remetente. Aceita um
// anexo opcional (campo "media" do formulário) — foto, documento ou áudio.
export async function sendSupportReply(conversationId: string, formData: FormData) {
  const body = String(formData.get("body") || "").trim();
  const mediaFile = formData.get("media");
  const hasMedia = mediaFile instanceof File && mediaFile.size > 0;
  if (!body && !hasMedia) return;

  const session = await requireFeature("whatsapp_suporte");
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true },
  });
  if (!conversation) return;

  const line = toWhatsAppLineId(conversation.line);
  const phone = conversation.customer.phone;

  let sent: boolean;
  let mediaUrl: string | undefined;
  let mediaType: string | undefined;
  let mediaMimeType: string | undefined;
  let mediaFileName: string | undefined;

  if (hasMedia && mediaFile instanceof File) {
    const buffer = Buffer.from(await mediaFile.arrayBuffer());
    const mimetype = mediaFile.type || "application/octet-stream";
    mediaUrl = await saveMediaBuffer(buffer, mimetype, mediaFile.name);
    mediaType = mediaCategoryFromMimetype(mimetype);
    mediaMimeType = mimetype;
    mediaFileName = mediaFile.name || undefined;

    // Responde SEMPRE pela mesma linha que recebeu a conversa.
    sent = await sendWhatsAppMedia(line, phone, {
      buffer,
      mimetype,
      fileName: mediaFileName,
      caption: body || undefined,
    });
  } else {
    sent = await sendWhatsAppMessage(line, phone, body);
  }

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        direction: "OUT",
        body,
        senderId: session?.userId,
        mediaUrl,
        mediaType,
        mediaMimeType,
        mediaFileName,
      },
    }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
  ]);

  revalidatePath("/admin/whatsapp/suporte");

  // Sempre redireciona pra normalizar a URL (tira um aviso antigo numa reenvio
  // que deu certo). WhatsApp desconectado: a mensagem fica registrada, mas o
  // cliente NÃO recebeu — avisa em vez de deixar parecer que foi entregue.
  redirect(`/admin/whatsapp/suporte?c=${conversationId}${sent ? "" : "&aviso=nao-entregue"}`);
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
  const sent = await sendWhatsAppMessage(
    toWhatsAppLineId(conversation.line),
    conversation.customer.phone,
    ratingMessage
  );

  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversationId },
      // Só entra em "modo avaliação" (próxima mensagem do cliente vira nota) se o
      // pedido realmente saiu — senão o cliente responde outra coisa e vira 1-5 sem contexto.
      data: { status: "RESOLVED", resolvedById: session.userId, ratingRequested: sent },
    }),
    ...(sent
      ? [
          prisma.message.create({
            data: { conversationId, direction: "OUT", body: ratingMessage, senderId: session.userId },
          }),
        ]
      : []),
  ]);

  revalidatePath("/admin/whatsapp/suporte");

  redirect(`/admin/whatsapp/suporte?c=${conversationId}${sent ? "" : "&aviso=avaliacao-nao-enviada"}`);
}
