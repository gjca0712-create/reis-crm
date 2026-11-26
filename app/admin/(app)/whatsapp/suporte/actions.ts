"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionFeatures, requireFeature } from "@/lib/session";
import { canAccess } from "@/lib/permissions";
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
import { quoteSnippet } from "@/lib/whatsapp/quote";
import {
  FIRST_FOLLOW_UP_DAYS,
  NEXT_FOLLOW_UP_DAYS,
  followUpDate,
  isConversationOutcome,
  isFollowUpDays,
  isQuoteLostReason,
  parseMoney,
  type ConversationOutcome,
} from "@/lib/whatsapp/outcome";
import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth";
import { VOICE_NOTE_MIMETYPE, oggOpusInfo } from "@/lib/whatsapp/voice-note";
import {
  canManageQueue,
  sentMessagePermissions,
  type MessageActionResult,
} from "@/lib/whatsapp/message-permissions";
import { RATING_PROMPT, isRatingPrompt, stopWaitingForRating, removeAudioCaption } from "@/lib/whatsapp/inbound";
import {
  QUEUE_TAB_COOKIE,
  QUEUE_VIEW_COOKIE,
  firstInQueue,
  loadQueueViewer,
  parseQueueTab,
  parseQueueView,
  queueBlockReason,
  seesWholeTeam,
  type QueueTab,
  type QueueView,
  type QueueViewer,
} from "@/lib/whatsapp/queue";
import {
  SUPPORT_FILTERS_COOKIE,
  effectiveSupportFilters,
  parseSupportFiltersCookie,
  supportFiltersQuery,
  type SupportFilters,
} from "@/lib/whatsapp/filters";
import { transferConversationAs, transferToAgentAs } from "@/lib/whatsapp/transfer";
import { refreshSupport } from "@/lib/whatsapp/live";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { BAIRRO_NAO_INFORMADO, hasBairro } from "@/lib/customers/contact";
import { FASE_OBRA_LABELS } from "@/lib/constants";

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

  refreshSupport();
  redirect(`/admin/whatsapp/suporte?c=${conversationId}${lostRace ? "&aviso=ja-assumida" : ""}`);
}

// Visão da fila pra CEO/Gerente: "mine" (espera + as dele, padrão)
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
  refreshSupport();
}

// Aba da fila: "Fila" (tudo) ou "Sem resposta +4h". Em cookie, igual
// ao Meus/Equipe, pra continuar na aba depois de responder/concluir.
export async function setSupportTab(tab: QueueTab) {
  await requireFeature("whatsapp_suporte");
  (await cookies()).set(QUEUE_TAB_COOKIE, parseQueueTab(tab), {
    path: "/admin/whatsapp",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  refreshSupport();
}

// Filtros do Suporte (lib/whatsapp/filters.ts): em cookie, igual à aba. Sem
// redirect: a tela atualiza no lugar e o painel de filtros continua aberto pra
// marcar o próximo (a URL, quando precisa, a própria tela ajusta). O que cada
// um pode usar (Finalizados só CEO/Gerente) a tela decide ao ler.
export async function saveSupportFilters(query: string) {
  await requireFeature("whatsapp_suporte");
  await writeSupportFilters(parseSupportFiltersCookie(query.slice(0, 2000)));
  refreshSupport();
}

async function writeSupportFilters(filters: SupportFilters) {
  const store = await cookies();
  const query = supportFiltersQuery(filters);
  if (!query) {
    store.delete({ name: SUPPORT_FILTERS_COOKIE, path: "/admin/whatsapp" });
    return;
  }
  store.set(SUPPORT_FILTERS_COOKIE, query, {
    path: "/admin/whatsapp",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

// Visão e filtros escolhidos na tela — a próxima da fila segue a mesma ordem.
async function queuePrefs(viewer: QueueViewer) {
  const store = await cookies();
  const view = parseQueueView(store.get(QUEUE_VIEW_COOKIE)?.value);
  const filters = effectiveSupportFilters(parseSupportFiltersCookie(store.get(SUPPORT_FILTERS_COOKIE)?.value), {
    canSeeFinished: canManageQueue(viewer.role),
    teamView: seesWholeTeam(viewer, view),
  });
  return { view, filters };
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
  refreshSupport();
  redirect(`/admin/whatsapp/suporte?c=${conversationId}`);
}

export async function connectWhatsAppAction(line: string) {
  await requireFeature("whatsapp_suporte");
  if (!isWhatsAppLineId(line)) return;
  await startWhatsAppConnection(line, { manual: true });
  refreshSupport();
}

// Sai de "Conectando..."/QR sem deslogar nada — pra quando a tentativa travou
// ou ninguém vai ler o QR agora.
export async function cancelWhatsAppConnectionAction(line: string) {
  await requireFeature("whatsapp_suporte");
  if (!isWhatsAppLineId(line)) return;
  cancelWhatsAppConnection(line);
  refreshSupport();
}

export async function disconnectWhatsAppAction(line: string) {
  await requireFeature("whatsapp_suporte");
  if (!isWhatsAppLineId(line)) return;
  await disconnectWhatsApp(line);
  refreshSupport();
}

// Envia de verdade se a conexão WhatsApp Web estiver ativa; sempre registra a
// mensagem internamente, com o atendente logado como remetente. Aceita um
// anexo opcional (campo "media" do formulário) — foto, documento ou áudio —
// e a mensagem que está sendo respondida (campo "quotedId", o id dela no CRM).
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

  // Só mensagem do mesmo cliente (desta conversa ou de um atendimento
  // anterior dele) que chegou a passar pelo WhatsApp.
  const quotedId = String(formData.get("quotedId") || "");
  const quoted = quotedId
    ? await prisma.message.findFirst({
        where: {
          id: quotedId,
          deletedAt: null,
          waMessageId: { not: null },
          conversation: { customerId: conversation.customerId },
        },
        select: { waMessageId: true, direction: true, body: true, mediaType: true, mediaFileName: true },
      })
    : null;
  const quote = quoted?.waMessageId
    ? { id: quoted.waMessageId, fromMe: quoted.direction === "OUT", text: quoteSnippet(quoted) }
    : undefined;

  let result: WaSendResult;
  let mediaUrl: string | undefined;
  let mediaType: string | undefined;
  let mediaMimeType: string | undefined;
  let mediaFileName: string | undefined;

  if (hasMedia && mediaFile instanceof File) {
    const buffer = Buffer.from(await mediaFile.arrayBuffer());
    // Gravado no CRM (voice=1, ReplyForm): só vai como mensagem de voz se for
    // mesmo Ogg/Opus — senão segue como um arquivo de áudio qualquer.
    const voiceNote = formData.get("voice") === "1" ? oggOpusInfo(buffer) : null;
    const mimetype = voiceNote ? VOICE_NOTE_MIMETYPE : mediaFile.type || "application/octet-stream";
    mediaUrl = await saveMediaBuffer(buffer, mimetype, voiceNote ? "audio.ogg" : mediaFile.name);
    mediaType = mediaCategoryFromMimetype(mimetype);
    mediaMimeType = mimetype;
    mediaFileName = voiceNote ? undefined : mediaFile.name || undefined;

    // Responde SEMPRE pela mesma linha que recebeu a conversa. Foto/vídeo/
    // documento sem texto levam só o nome na legenda; áudio sem texto vai sem
    // (a legenda do áudio é uma mensagem separada — só o nome ficaria solto).
    result = await sendWhatsAppMedia(line, conversation.customer, {
      buffer,
      mimetype,
      fileName: mediaFileName,
      caption: (body || mediaType !== "audio" ? signAgentMessage(senderName, body) : body) || undefined,
      voiceNoteSeconds: voiceNote?.seconds,
    }, quote);
  } else {
    result = await sendWhatsAppMessage(line, conversation.customer, signAgentMessage(senderName, body), quote);
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
        ...(quote && { quotedWaMessageId: quote.id, quotedBody: quote.text, quotedFromMe: quote.fromMe }),
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

  refreshSupport();

  // Saiu: não redireciona. Redirect remonta a tela inteira — a caixa de texto
  // perdia o foco (tinha que clicar nela de novo pra mandar a próxima) e o que
  // já estava sendo digitado. Só quando a tela mostra o aviso de uma tentativa
  // anterior, pra tirar ele. Quando não sai, distingue o motivo — linha
  // desconectada ou número salvo inválido — senão o atendente manda reconectar
  // uma linha que já está conectada, achando que é isso que está impedindo o envio.
  const aviso = sent ? null : isSendablePhone(phone) ? "nao-entregue" : "numero-invalido";
  if (!aviso && !(await showingAviso())) return;
  redirect(`/admin/whatsapp/suporte?c=${conversationId}${aviso ? `&aviso=${aviso}` : ""}`);
}

// A tela de onde veio a ação está com um aviso no topo (?aviso=...).
async function showingAviso(): Promise<boolean> {
  const referer = (await headers()).get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).searchParams.has("aviso");
  } catch {
    return false;
  }
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
  if (outcome && "conversationId" in outcome) {
    const retorno = String(formData.get("retorno") || "");
    if (retorno) await recordQuoteCall(session, retorno, outcome.conversationId);
    // Começou pelo "Nova conversa" de um atendimento finalizado: a tela volta
    // pra fila em aberto, onde a conversa nova está.
    const filters = parseSupportFiltersCookie((await cookies()).get(SUPPORT_FILTERS_COOKIE)?.value);
    if (filters.status === "finalizados") {
      await writeSupportFilters({ ...filters, status: "abertos", order: "atividade", agents: [] });
    }
    refreshSupport();
  }
  return outcome;
}

// --- Transferir pra outro setor ou pra um atendente --------------------------------
// Regras em lib/whatsapp/transfer.ts. to=agent manda pro atendente escolhido
// (agent); senão, pra fila do setor (sector). Sem redirect, igual à Nova conversa:
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
  const reason = String(formData.get("reason") || "");
  const result =
    formData.get("to") === "agent"
      ? await transferToAgentAs(viewer, conversationId, String(formData.get("agent") || ""), reason)
      : await transferConversationAs(viewer, conversationId, String(formData.get("sector") || ""), reason);
  if ("error" in result) return result;

  refreshSupport();
  const { view, filters } = await queuePrefs(viewer);
  return { next: await firstInQueue(viewer, view, conversationId, filters) };
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
  // Resultado do atendimento é obrigatório pra finalizar (o botão já fica
  // travado na tela; aqui vale pra quem clicou numa tela desatualizada).
  if (!conversation.outcome) redirect(`/admin/whatsapp/suporte?c=${conversationId}&aviso=sem-resultado`);

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
      data: {
        status: "RESOLVED",
        resolvedById: session.userId,
        resolvedAt: new Date(),
        ratingRequested: sent,
        assignedToId: null,
      },
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

  refreshSupport();

  const aviso =
    sent || !SEND_RATING_PROMPT
      ? null
      : isSendablePhone(conversation.customer.phone)
        ? "avaliacao-nao-enviada"
        : "avaliacao-numero-invalido";
  // Concluída sai da tela: abre a próxima da fila (com o id na URL, senão a
  // conversa aberta trocaria sozinha quando a lista reordena no auto-refresh).
  const { view, filters } = await queuePrefs(viewer);
  const next = await firstInQueue(viewer, view, undefined, filters);
  const query = [next && `c=${next}`, aviso && `aviso=${aviso}`].filter(Boolean).join("&");
  redirect(`/admin/whatsapp/suporte${query ? `?${query}` : ""}`);
}


// --- Resultado do atendimento (Venda / Orçamento / Informação) -----------------
// Os botões ficam embaixo do cabeçalho da conversa (OutcomePicker). Clicar no
// que já está marcado desmarca (outcome null). Sem redirect: a tela só
// atualiza (refreshSupport) e a resposta que estiver sendo digitada fica lá.
// O crédito no relatório vai pro atendente da conversa — quem está com ela, ou
// quem finalizou —, não pra quem clicou: o gerente corrigindo a marcação de um
// atendimento antigo não "rouba" a venda. Conversa de ninguém: quem marcou.

type ActionResult = { error?: string };

// Quem pode marcar o resultado: quem pode abrir a conversa (finalizada, só
// CEO/Gerente — a tela já não mostra pros outros).
async function loadOutcomeTarget(session: SessionPayload, conversationId: string) {
  const viewer = await loadQueueViewer(session);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      status: true,
      assignedToId: true,
      sector: true,
      resolvedById: true,
      customerId: true,
      outcome: true,
      quoteStatus: true,
      quoteClosedAt: true,
      followUpAt: true,
    },
  });
  if (!conversation) return { error: "Essa conversa não existe mais." } as const;
  if (queueBlockReason(viewer, conversation)) return { error: "Essa conversa está com outro atendente agora." } as const;
  if (conversation.status !== "OPEN" && !canAccess(await getSessionFeatures(session), "whatsapp_gestao")) {
    return { error: "Esse atendimento já foi finalizado." } as const;
  }
  return { conversation } as const;
}

// O que muda no orçamento quando o resultado muda. Orçamento abre (com retorno
// pra amanhã); Orçamento → Venda conta como orçamento que virou venda; qualquer
// outra coisa desfaz o orçamento (foi marcado errado).
function quoteFieldsFor(
  current: { quoteStatus: string | null; quoteClosedAt: Date | null; followUpAt: Date | null },
  next: ConversationOutcome | null,
  now: Date
): Prisma.ConversationUpdateInput {
  if (next === "ORCAMENTO") {
    return {
      quoteStatus: "ABERTO",
      quoteLostReason: null,
      quoteClosedAt: null,
      followUpAt:
        current.quoteStatus === "ABERTO" && current.followUpAt
          ? current.followUpAt
          : followUpDate(FIRST_FOLLOW_UP_DAYS, now),
    };
  }
  if (next === "VENDA") {
    return current.quoteStatus
      ? {
          quoteStatus: "VENDIDO",
          quoteLostReason: null,
          quoteClosedAt: current.quoteStatus === "VENDIDO" ? current.quoteClosedAt : now,
          followUpAt: null,
        }
      : {};
  }
  return {
    quoteStatus: null,
    quoteLostReason: null,
    quoteClosedAt: null,
    followUpAt: null,
    followUpCount: 0,
    outcomeValue: null,
  };
}

// Venda de um cliente fecha os orçamentos em aberto dele (dos últimos 60
// dias) como "virou venda": o cliente que pediu orçamento e voltou depois pra
// comprar, numa conversa nova.
const QUOTE_MATCH_DAYS = 60;

export async function setConversationOutcome(conversationId: string, outcome: string | null): Promise<ActionResult> {
  const session = await requireFeature("whatsapp_suporte");
  if (outcome !== null && !isConversationOutcome(outcome)) return { error: "Opção inválida." };
  const target = await loadOutcomeTarget(session, conversationId);
  if ("error" in target) return { error: target.error };
  const { conversation } = target;
  const now = new Date();

  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(outcome
          ? {
              outcome,
              outcomeAgent: {
                connect: { id: conversation.assignedToId ?? conversation.resolvedById ?? session.userId },
              },
              outcomeAt: now,
            }
          : { outcome: null, outcomeAgent: { disconnect: true }, outcomeAt: null }),
        ...quoteFieldsFor(conversation, outcome, now),
      },
    }),
    ...(outcome === "VENDA"
      ? [
          prisma.conversation.updateMany({
            where: {
              customerId: conversation.customerId,
              id: { not: conversationId },
              quoteStatus: "ABERTO",
              createdAt: { gte: new Date(now.getTime() - QUOTE_MATCH_DAYS * 86_400_000) },
            },
            data: { quoteStatus: "VENDIDO", quoteClosedAt: now, followUpAt: null },
          }),
          // Comprou: o contato do WhatsApp passa a cliente (o lembrete do
          // cadastro continua até completarem nome e bairro).
          prisma.customer.update({ where: { id: conversation.customerId }, data: { isContact: false } }),
        ]
      : []),
  ]);

  refreshSupport();
  if (outcome === "VENDA") revalidatePath("/admin/clientes");
  return {};
}

// --- Cadastro do contato sem sair da conversa ----------------------------------
// "Dados do contato" (ContactInfo) e o lembrete na faixa do resultado
// (OutcomePicker) mandam pra cá. Só os campos que vieram no formulário mudam
// (o lembrete manda só nome e bairro). Com nome e bairro, o contato do
// WhatsApp vira cliente. Quem pode: quem pode abrir a conversa.
export async function saveContactDetails(conversationId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireFeature("whatsapp_suporte");
  const target = await loadOutcomeTarget(session, conversationId);
  if ("error" in target) return { error: target.error };
  const customerId = target.conversation.customerId;

  const field = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v.trim() : null;
  };
  const name = field("name");
  if (name !== null && !name) return { error: "Coloque o nome do cliente." };
  const bairro = field("bairro");
  const faseObra = field("faseObra");
  if (faseObra && !(faseObra in FASE_OBRA_LABELS)) return { error: "Fase da obra inválida." };
  const referredById = field("referredById");
  if (referredById && !(await prisma.partner.findUnique({ where: { id: referredById }, select: { id: true } }))) {
    return { error: "Esse indicador não existe mais." };
  }
  const notes = field("notes");

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      ...(name !== null ? { name } : {}),
      ...(bairro !== null ? { bairro: bairro || BAIRRO_NAO_INFORMADO } : {}),
      ...(hasBairro(bairro) ? { isContact: false } : {}),
      ...(faseObra !== null ? { faseObra: faseObra || null } : {}),
      ...(referredById !== null ? { referredById: referredById || null } : {}),
      ...(notes !== null ? { notes: notes || null } : {}),
    },
  });

  refreshSupport();
  revalidatePath("/admin/clientes");
  revalidatePath(`/admin/clientes/${customerId}`);
  return {};
}

// Valor em R$ da venda ou do orçamento ("" apaga).
export async function setOutcomeValue(conversationId: string, raw: string): Promise<ActionResult> {
  const session = await requireFeature("whatsapp_suporte");
  const target = await loadOutcomeTarget(session, conversationId);
  if ("error" in target) return { error: target.error };
  if (target.conversation.outcome !== "VENDA" && target.conversation.outcome !== "ORCAMENTO") {
    return { error: "Marque Venda ou Orçamento antes do valor." };
  }
  const value = parseMoney(raw);
  if (value === undefined) return { error: "Valor inválido — ex.: 1.250,00" };

  await prisma.conversation.update({ where: { id: conversationId }, data: { outcomeValue: value } });
  refreshSupport();
  return {};
}

// --- Retornos de orçamento (aba Retornos do Suporte e a conversa) ---------------
// Quem pode mexer: o atendente do orçamento, quem está com a conversa agora e
// CEO/Gerente. Vale também pra conversa já finalizada — o atendente não abre
// ela de novo, mas o orçamento continua sendo dele.
async function loadQuote(session: SessionPayload, conversationId: string) {
  const quote = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { quoteStatus: true, outcomeAgentId: true, assignedToId: true },
  });
  if (!quote?.quoteStatus) return { error: "Esse orçamento não existe mais." } as const;
  const allowed =
    canManageQueue(session.role) || quote.outcomeAgentId === session.userId || quote.assignedToId === session.userId;
  if (!allowed) return { error: "Esse orçamento é de outro atendente." } as const;
  return { quote } as const;
}

// "Adiar" / "Retornar em": o próximo retorno, N dias pra frente (8h da loja).
export async function snoozeQuote(conversationId: string, days: number): Promise<ActionResult> {
  const session = await requireFeature("whatsapp_suporte");
  if (!isFollowUpDays(days)) return { error: "Opção inválida." };
  const target = await loadQuote(session, conversationId);
  if ("error" in target) return { error: target.error };
  if (target.quote.quoteStatus !== "ABERTO") return { error: "Esse orçamento já foi fechado." };

  await prisma.conversation.update({ where: { id: conversationId }, data: { followUpAt: followUpDate(days) } });
  refreshSupport();
  return {};
}

// Fecha o orçamento: "VENDIDO" (comprou — na loja, por telefone...: a conversa
// passa a contar como Venda) ou "PERDIDO" (com o motivo).
export async function closeQuote(
  conversationId: string,
  result: "VENDIDO" | "PERDIDO",
  reason?: string
): Promise<ActionResult> {
  const session = await requireFeature("whatsapp_suporte");
  const target = await loadQuote(session, conversationId);
  if ("error" in target) return { error: target.error };
  const now = new Date();

  await prisma.conversation.update({
    where: { id: conversationId },
    data:
      result === "VENDIDO"
        ? {
            outcome: "VENDA",
            outcomeAt: now,
            quoteStatus: "VENDIDO",
            quoteLostReason: null,
            quoteClosedAt: now,
            followUpAt: null,
          }
        : {
            outcome: "ORCAMENTO",
            quoteStatus: "PERDIDO",
            quoteLostReason: isQuoteLostReason(reason) ? reason : "OUTRO",
            quoteClosedAt: now,
            followUpAt: null,
          },
  });
  refreshSupport();
  return {};
}

// Desfaz o "não fechou" (clique errado ou o cliente voltou): em aberto de novo,
// com retorno pra amanhã.
export async function reopenQuote(conversationId: string): Promise<ActionResult> {
  const session = await requireFeature("whatsapp_suporte");
  const target = await loadQuote(session, conversationId);
  if ("error" in target) return { error: target.error };

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      outcome: "ORCAMENTO",
      quoteStatus: "ABERTO",
      quoteLostReason: null,
      quoteClosedAt: null,
      followUpAt: followUpDate(FIRST_FOLLOW_UP_DAYS),
    },
  });
  refreshSupport();
  return {};
}

// Mensagem do retorno saiu (Nova conversa aberta pelo "Chamar" da aba
// Retornos): conta a chamada e agenda o próximo retorno, caso o cliente não
// responda. Sem permissão, já fechado ou mensagem pra outro cliente (a janela
// ficou aberta e escolheram outro): ignora — a mensagem já foi.
async function recordQuoteCall(session: SessionPayload, quoteId: string, sentConversationId: string) {
  const target = await loadQuote(session, quoteId);
  if ("error" in target || target.quote.quoteStatus !== "ABERTO") return;
  const [quote, sent] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: quoteId }, select: { customerId: true } }),
    prisma.conversation.findUnique({ where: { id: sentConversationId }, select: { customerId: true } }),
  ]);
  if (!quote || quote.customerId !== sent?.customerId) return;
  await prisma.conversation.update({
    where: { id: quoteId },
    data: { followUpCount: { increment: 1 }, followUpAt: followUpDate(NEXT_FOLLOW_UP_DAYS) },
  });
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

  refreshSupport();
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
      refreshSupport();
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

  refreshSupport();
  return undefined;
}
