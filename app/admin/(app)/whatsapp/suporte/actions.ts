"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/session";
import {
  startWhatsAppConnection,
  disconnectWhatsApp,
  cancelWhatsAppConnection,
  isSendablePhone,
  deleteWhatsAppMessageForEveryone,
  editWhatsAppMessage,
  type WaSendResult,
} from "@/lib/whatsapp/client";
import { sendWhatsAppMessage, sendWhatsAppMedia } from "@/lib/whatsapp/send";
import { agentName, signAgentMessage } from "@/lib/whatsapp/signature";
import { isWhatsAppLineId, toWhatsAppLineId } from "@/lib/whatsapp/lines";
import {
  searchCustomersForChat,
  startConversationAs,
  type ChatCustomerOption,
  type StartConversationResult,
} from "@/lib/whatsapp/start-conversation";
import { saveMediaBuffer, mediaCategoryFromMimetype } from "@/lib/whatsapp/media";
import {
  canManageQueue,
  sentMessagePermissions,
  type MessageActionResult,
} from "@/lib/whatsapp/message-permissions";
import { RATING_PROMPT, isRatingPrompt, stopWaitingForRating, removeAudioCaption } from "@/lib/whatsapp/inbound";
import {
  QUEUE_VIEW_COOKIE,
  firstInQueue,
  loadQueueViewer,
  parseQueueView,
  queueBlockReason,
  type QueueView,
  type QueueViewer,
} from "@/lib/whatsapp/queue";
import { transferConversationAs } from "@/lib/whatsapp/transfer";
import { logAudit } from "@/lib/audit";

// Conversa assumida por OUTRO atendente, ou transferida pra outro setor — a
// tela já esconde, mas a action confere de novo: a tela do atendente só
// atualiza a cada 12s, então ele pode clicar "Enviar"/"Resolvido" numa conversa
// que um colega acabou de assumir. Redireciona com aviso em vez de lançar erro
// (erro de server action vira a tela genérica "Algo deu errado" em produção).
function redirectIfBlocked(
  viewer: QueueViewer,
  conversation: { status: string; assignedToId: string | null; sector: string | null }
) {
  const reason = queueBlockReason(viewer, conversation);
  if (reason) redirect(`/admin/whatsapp/suporte?aviso=${reason}`);
}

// Assume a conversa pra fila pessoal do atendente. Update condicional
// (assignedToId: null no where) em vez de ler-depois-gravar — evita que dois
// atendentes clicando "Assumir" ao mesmo tempo assumam a mesma conversa. Só
// conversa em aberto: a resolvida nunca é reaproveitada (a próxima mensagem do
// cliente abre outra, ver lib/whatsapp/inbound.ts), assumir ela só esconderia
// o histórico dos colegas.
export async function claimConversation(conversationId: string) {
  const session = await requireFeature("whatsapp_suporte");
  const viewer = await loadQueueViewer(session);
  const target = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true, assignedToId: true, sector: true },
  });
  if (!target) return;
  if (queueBlockReason(viewer, target) === "outro-setor") redirect("/admin/whatsapp/suporte?aviso=outro-setor");

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

// Visão da coluna Em atendimento pra CEO/Gerente: "mine" (só as dele, padrão)
// ou "team" (supervisão). Guardada em cookie — ver QUEUE_VIEW_COOKIE. Pros
// demais o cookie é ignorado (seesWholeTeam), então nem precisa checar aqui.
export async function setSupportView(view: QueueView) {
  await requireFeature("whatsapp_suporte");
  (await cookies()).set(QUEUE_VIEW_COOKIE, parseQueueView(view), {
    path: "/admin/whatsapp",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/admin/whatsapp/suporte");
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
  redirectIfBlocked(await loadQueueViewer(session), conversation);

  const line = toWhatsAppLineId(conversation.line);
  const phone = conversation.customer.phone;
  const senderName = await agentName(session.userId);

  let result: WaSendResult;
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

    // Responde SEMPRE pela mesma linha que recebeu a conversa. Foto/vídeo/
    // documento sem texto levam só o nome na legenda; áudio sem texto vai sem
    // (a legenda do áudio é uma mensagem separada — só o nome ficaria solto).
    result = await sendWhatsAppMedia(line, conversation.customer, {
      buffer,
      mimetype,
      fileName: mediaFileName,
      caption: (body || mediaType !== "audio" ? signAgentMessage(senderName, body) : body) || undefined,
    });
  } else {
    result = await sendWhatsAppMessage(line, conversation.customer, signAgentMessage(senderName, body));
  }
  const sent = result.sent;

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
        waMessageId: result.ref?.id,
        waRemoteJid: result.ref?.remoteJid,
        waCaptionMessageId: result.ref?.captionId,
      },
    }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
    // Quem responde uma conversa em espera assume ela: sai da espera dos
    // colegas, e dois atendentes não respondem o mesmo cliente. Condicional,
    // igual ao claimConversation — se alguém assumiu nesse meio-tempo, fica com ele.
    prisma.conversation.updateMany({
      where: { id: conversationId, assignedToId: null, status: "OPEN" },
      data: { assignedToId: session.userId },
    }),
  ]);

  revalidatePath("/admin/whatsapp/suporte");

  // Sempre redireciona pra normalizar a URL (tira um aviso antigo numa reenvio
  // que deu certo). Quando não sai, distingue o motivo — linha desconectada ou
  // número salvo inválido — senão o atendente manda reconectar uma linha que
  // já está conectada, achando que é isso que está impedindo o envio.
  const aviso = sent ? null : isSendablePhone(phone) ? "nao-entregue" : "numero-invalido";
  redirect(`/admin/whatsapp/suporte?c=${conversationId}${aviso ? `&aviso=${aviso}` : ""}`);
}

// --- Iniciar conversa pelo CRM (lib/whatsapp/start-conversation.ts) -----------

export async function searchChatCustomers(query: string): Promise<ChatCustomerOption[]> {
  await requireFeature("whatsapp_suporte");
  return searchCustomersForChat(query);
}

export async function startConversation(
  _prev: StartConversationResult,
  formData: FormData
): Promise<StartConversationResult> {
  const session = await requireFeature("whatsapp_suporte");
  const outcome = await startConversationAs(session.userId, {
    customerId: String(formData.get("customerId") || "") || undefined,
    phone: String(formData.get("phone") || ""),
    name: String(formData.get("name") || ""),
    line: String(formData.get("line") || ""),
    body: String(formData.get("body") || ""),
  });
  if (outcome && "conversationId" in outcome) revalidatePath("/admin/whatsapp/suporte");
  return outcome;
}

// --- Transferir pra outro setor ---------------------------------------------------
// Regras em lib/whatsapp/transfer.ts. Sem redirect, igual à Nova conversa:
// dando erro, a janela continua aberta com o texto; dando certo, a tela abre a
// próxima da fila (next).
export type TransferResult = { error: string } | { next: string | null } | undefined;

export async function transferConversation(
  conversationId: string,
  _prev: TransferResult,
  formData: FormData
): Promise<TransferResult> {
  const session = await requireFeature("whatsapp_suporte");
  const viewer = await loadQueueViewer(session);
  const result = await transferConversationAs(
    viewer,
    conversationId,
    String(formData.get("sector") || ""),
    String(formData.get("reason") || "")
  );
  if ("error" in result) return result;

  revalidatePath("/admin/whatsapp/suporte");
  const view = parseQueueView((await cookies()).get(QUEUE_VIEW_COOKIE)?.value);
  return { next: await firstInQueue(viewer, view, conversationId) };
}

// Pedido de avaliação DESLIGADO (2026-09-28): a mesma mensagem automática pra
// todo cliente atendido pode fazer o WhatsApp tratar a linha como spam. O
// formato novo ainda vai ser decidido; WHATSAPP_RATING_PROMPT=1 no Railway
// religa o de antes enquanto isso.
const SEND_RATING_PROMPT = process.env.WHATSAPP_RATING_PROMPT === "1";

// Marca a conversa como resolvida e credita o atendente. Com o pedido de
// avaliação ligado, também manda a pergunta (1 a 5) pro cliente via WhatsApp.
export async function resolveConversation(conversationId: string) {
  const session = await requireFeature("whatsapp_suporte");
  const viewer = await loadQueueViewer(session);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true },
  });
  if (!conversation) return;
  redirectIfBlocked(viewer, conversation);

  const { sent, ref }: WaSendResult = SEND_RATING_PROMPT
    ? await sendWhatsAppMessage(toWhatsAppLineId(conversation.line), conversation.customer, RATING_PROMPT)
    : { sent: false, ref: null };

  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversationId },
      // Só entra em "modo avaliação" (próxima mensagem do cliente vira nota) se o
      // pedido realmente saiu — senão o cliente responde outra coisa e vira 1-5 sem contexto.
      // Solta a atribuição: resolvida sai da fila de todo mundo e vira
      // histórico (quem atendeu continua registrado em resolvedById).
      data: { status: "RESOLVED", resolvedById: session.userId, ratingRequested: sent, assignedToId: null },
    }),
    ...(sent
      ? [
          prisma.message.create({
            data: {
              conversationId,
              direction: "OUT",
              body: RATING_PROMPT,
              senderId: session.userId,
              waMessageId: ref?.id,
              waRemoteJid: ref?.remoteJid,
            },
          }),
        ]
      : []),
  ]);

  revalidatePath("/admin/whatsapp/suporte");

  const aviso =
    sent || !SEND_RATING_PROMPT
      ? null
      : isSendablePhone(conversation.customer.phone)
        ? "avaliacao-nao-enviada"
        : "avaliacao-numero-invalido";
  // Concluída sai da tela: abre a próxima da fila (com o id na URL, senão a
  // conversa aberta trocaria sozinha quando a lista reordena no auto-refresh).
  const view = parseQueueView((await cookies()).get(QUEUE_VIEW_COOKIE)?.value);
  const next = await firstInQueue(viewer, view);
  const query = [next && `c=${next}`, aviso && `aviso=${aviso}`].filter(Boolean).join("&");
  redirect(`/admin/whatsapp/suporte${query ? `?${query}` : ""}`);
}


// --- Editar / apagar pra todos uma mensagem já enviada -------------------------
// Regras em lib/whatsapp/message-permissions.ts (a tela só mostra os botões
// quando dá; aqui confere de novo — a tela pode estar aberta há minutos e o
// prazo do WhatsApp ter passado nesse meio-tempo).
// Sem redirect no fim, de propósito: redirect remonta a tela inteira e apagaria
// a resposta que o atendente estiver digitando na caixa de baixo. Quando não
// dá, devolve o aviso pra tela mostrar ao lado da mensagem.

async function loadSentMessage(messageId: string) {
  return prisma.message.findUnique({
    where: { id: messageId },
    include: {
      conversation: {
        select: {
          id: true,
          line: true,
          status: true,
          assignedToId: true,
          sector: true,
          customer: { select: { name: true } },
        },
      },
    },
  });
}

export async function editSupportMessage(
  messageId: string,
  _prev: MessageActionResult,
  formData: FormData
): Promise<MessageActionResult> {
  const session = await requireFeature("whatsapp_suporte");
  const newBody = String(formData.get("body") || "").trim();

  const message = await loadSentMessage(messageId);
  if (!message) return { aviso: "indisponivel" };
  redirectIfBlocked(await loadQueueViewer(session), message.conversation);

  const rules = sentMessagePermissions(message, session);
  if (!rules.editable) return { aviso: "indisponivel" };
  if (!rules.canEdit) return { aviso: "edicao-fora-do-prazo" };
  if (!newBody || newBody === message.body) return undefined;

  // Áudio com legenda: o texto está na mensagem separada (ver sendWhatsAppMedia).
  const ok = await editWhatsAppMessage(
    toWhatsAppLineId(message.conversation.line),
    message.waCaptionMessageId ?? message.waMessageId!,
    message.waRemoteJid!,
    // Mesma assinatura do envio, com o nome de quem mandou (não de quem edita).
    signAgentMessage(await agentName(message.senderId), newBody)
  );
  if (!ok) return { aviso: "edicao-nao-enviada" };

  await prisma.message.update({
    where: { id: message.id },
    data: { body: newBody, editedAt: new Date(), originalBody: message.originalBody ?? message.body },
  });
  await logAudit({
    actor: session,
    action: "whatsapp.message_edit",
    targetId: message.id,
    targetLabel: message.conversation.customer.name,
    details: { antes: message.body, depois: newBody },
  });

  revalidatePath("/admin/whatsapp/suporte");
  return undefined;
}

export async function deleteSupportMessage(messageId: string): Promise<MessageActionResult> {
  const session = await requireFeature("whatsapp_suporte");

  const message = await loadSentMessage(messageId);
  if (!message) return { aviso: "indisponivel" };
  redirectIfBlocked(await loadQueueViewer(session), message.conversation);

  const rules = sentMessagePermissions(message, session);
  if (!rules.allowed) return { aviso: "indisponivel" };
  if (!rules.canDelete) return { aviso: "apagar-fora-do-prazo" };

  const line = toWhatsAppLineId(message.conversation.line);
  // Áudio com legenda: a legenda (mensagem de texto separada) sai primeiro. Se
  // o áudio falhar depois, a linha fica só com ele — e dá pra tentar de novo.
  if (message.waCaptionMessageId) {
    const captionOk = await deleteWhatsAppMessageForEveryone(line, message.waCaptionMessageId, message.waRemoteJid!);
    if (!captionOk) return { aviso: "apagar-nao-enviado" };
  }
  const ok = await deleteWhatsAppMessageForEveryone(line, message.waMessageId!, message.waRemoteJid!);
  if (!ok) {
    if (message.waCaptionMessageId) {
      await removeAudioCaption(message);
      revalidatePath("/admin/whatsapp/suporte");
    }
    return { aviso: "apagar-nao-enviado" };
  }

  await prisma.message.update({
    where: { id: message.id },
    data: { deletedAt: new Date(), deletedByName: session.name },
  });
  if (isRatingPrompt(message)) await stopWaitingForRating(message.conversationId);
  await logAudit({
    actor: session,
    action: "whatsapp.message_delete",
    targetId: message.id,
    targetLabel: message.conversation.customer.name,
    details: { texto: message.body, anexo: message.mediaFileName ?? message.mediaType ?? null },
  });

  revalidatePath("/admin/whatsapp/suporte");
  return undefined;
}
