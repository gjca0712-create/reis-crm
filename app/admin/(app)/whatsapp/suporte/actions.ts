"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/session";
import {
  startWhatsAppConnection,
  disconnectWhatsApp,
  cancelWhatsAppConnection,
  isSendablePhone,
} from "@/lib/whatsapp/client";
import { sendWhatsAppMessage, sendWhatsAppMedia } from "@/lib/whatsapp/send";
import { isWhatsAppLineId, toWhatsAppLineId } from "@/lib/whatsapp/lines";
import { saveMediaBuffer, mediaCategoryFromMimetype } from "@/lib/whatsapp/media";
import type { SessionPayload } from "@/lib/auth";

// CEO e Gerente enxergam e mexem em qualquer conversa (supervisão), mesmo já
// assumida por outro atendente — ver também o filtro da lista em page.tsx.
function canManageQueue(role: string): boolean {
  return role === "CEO" || role === "GERENTE";
}

// Conversa assumida por OUTRO atendente — a tela já esconde, mas a action
// confere de novo: a tela do atendente só atualiza a cada 12s, então ele pode
// clicar "Enviar"/"Resolvido" numa conversa que um colega acabou de assumir.
// Quem chama redireciona com aviso em vez de lançar erro (erro de server
// action vira a tela genérica "Algo deu errado" em produção).
function isHeldByAnother(conversation: { assignedToId: string | null }, session: SessionPayload): boolean {
  return Boolean(
    conversation.assignedToId && conversation.assignedToId !== session.userId && !canManageQueue(session.role)
  );
}

// Assume a conversa pra fila pessoal do atendente. Update condicional
// (assignedToId: null no where) em vez de ler-depois-gravar — evita que dois
// atendentes clicando "Assumir" ao mesmo tempo assumam a mesma conversa. Só
// conversa em aberto: a resolvida nunca é reaproveitada (a próxima mensagem do
// cliente abre outra, ver lib/whatsapp/inbound.ts), assumir ela só esconderia
// o histórico dos colegas.
export async function claimConversation(conversationId: string) {
  const session = await requireFeature("whatsapp_suporte");

  const result = await prisma.conversation.updateMany({
    where: { id: conversationId, assignedToId: null, status: "OPEN" },
    data: { assignedToId: session.userId },
  });

  // count 0 também acontece quando a própria pessoa já tinha assumido (clique
  // duplo, outra aba) — só avisa se quem está com ela é outro atendente.
  let lostRace = false;
  if (result.count === 0) {
    const current = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { assignedToId: true },
    });
    lostRace = Boolean(current?.assignedToId && current.assignedToId !== session.userId);
  }

  revalidatePath("/admin/whatsapp/suporte");
  redirect(`/admin/whatsapp/suporte?c=${conversationId}${lostRace ? "&aviso=ja-assumida" : ""}`);
}

// Devolve a conversa pra fila (livre pra qualquer um assumir de novo). Só
// quem assumiu ou CEO/Gerente pode liberar — o botão já só aparece pra eles,
// isso é a segunda checagem do lado do servidor.
export async function releaseConversation(conversationId: string) {
  const session = await requireFeature("whatsapp_suporte");

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { assignedToId: true },
  });
  if (!conversation) return;
  if (conversation.assignedToId !== session.userId && !canManageQueue(session.role)) return;

  await prisma.conversation.update({ where: { id: conversationId }, data: { assignedToId: null } });
  revalidatePath("/admin/whatsapp/suporte");
  redirect(`/admin/whatsapp/suporte?c=${conversationId}`);
}

export async function connectWhatsAppAction(line: string) {
  await requireFeature("whatsapp_suporte");
  if (!isWhatsAppLineId(line)) return;
  await startWhatsAppConnection(line, { manual: true });
  revalidatePath("/admin/whatsapp/suporte");
}

// Sai de "Conectando..."/QR sem deslogar nada — pra quando a tentativa travou
// ou ninguém vai ler o QR agora.
export async function cancelWhatsAppConnectionAction(line: string) {
  await requireFeature("whatsapp_suporte");
  if (!isWhatsAppLineId(line)) return;
  cancelWhatsAppConnection(line);
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
  if (isHeldByAnother(conversation, session)) redirect("/admin/whatsapp/suporte?aviso=assumida-por-outro");

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
  // que deu certo). Quando não sai, distingue o motivo — linha desconectada ou
  // número salvo inválido — senão o atendente manda reconectar uma linha que
  // já está conectada, achando que é isso que está impedindo o envio.
  const aviso = sent ? null : isSendablePhone(phone) ? "nao-entregue" : "numero-invalido";
  redirect(`/admin/whatsapp/suporte?c=${conversationId}${aviso ? `&aviso=${aviso}` : ""}`);
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
  if (isHeldByAnother(conversation, session)) redirect("/admin/whatsapp/suporte?aviso=assumida-por-outro");

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
      // Solta a atribuição: resolvida volta a ser histórico visível pra todos
      // (quem atendeu continua registrado em resolvedById).
      data: { status: "RESOLVED", resolvedById: session.userId, ratingRequested: sent, assignedToId: null },
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

  const aviso = sent
    ? null
    : isSendablePhone(conversation.customer.phone)
      ? "avaliacao-nao-enviada"
      : "avaliacao-numero-invalido";
  redirect(`/admin/whatsapp/suporte?c=${conversationId}${aviso ? `&aviso=${aviso}` : ""}`);
}
