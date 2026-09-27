import { WHATSAPP_EDIT_WINDOW_MS, WHATSAPP_DELETE_WINDOW_MS } from "./client";
import { isRatingPrompt } from "./inbound";

// CEO e Gerente enxergam e mexem em qualquer conversa (supervisão), mesmo já
// assumida por outro atendente.
export function canManageQueue(role: string): boolean {
  return role === "CEO" || role === "GERENTE";
}

type SentMessage = {
  direction: string;
  senderId: string | null;
  createdAt: Date;
  waSentAt: Date | null;
  deletedAt: Date | null;
  body: string;
  originalBody: string | null;
  mediaType: string | null;
  waMessageId: string | null;
  waRemoteJid: string | null;
  waCaptionMessageId: string | null;
};

// Retorno de editSupportMessage/deleteSupportMessage quando não deu (a tela
// mostra o aviso ao lado da mensagem, sem sair da conversa).
export type MessageActionResult = { aviso: string } | undefined;

// Regras de "Editar" / "Apagar para todos" numa mensagem ENVIADA — a tela usa
// pra mostrar os botões e as actions conferem de novo no servidor.
// - Só mensagem nossa que saiu pelo WhatsApp com id guardado (as de antes disso
//   existir, ou que não chegaram a sair, não têm como).
// - Quem mandou, ou CEO/Gerente (inclusive as respondidas pelo celular, que não
//   têm remetente no CRM).
// - Editar: só texto. Legenda de foto/vídeo/documento fica de fora (o WhatsApp
//   pede outro formato pra isso); áudio com legenda edita a mensagem de texto
//   que foi separada dele. O pedido de avaliação também não: a conversa segue
//   esperando a nota — dá pra apagar (aí ela para de esperar).
// - Prazos contados de quando a mensagem saiu no WhatsApp (waSentAt, pras que
//   vieram do celular pareado — podem ter chegado atrasadas); as mandadas pelo
//   CRM saem na hora em que são gravadas (createdAt).
export function sentMessagePermissions(message: SentMessage, viewer: { userId: string; role: string }, now = Date.now()) {
  const allowed =
    message.direction === "OUT" &&
    !message.deletedAt &&
    Boolean(message.waMessageId && message.waRemoteJid) &&
    (message.senderId === viewer.userId || canManageQueue(viewer.role));
  const age = now - (message.waSentAt ?? message.createdAt).getTime();
  const textOnly = !message.mediaType || (message.mediaType === "audio" && Boolean(message.waCaptionMessageId));
  const editable = allowed && textOnly && !isRatingPrompt(message);

  return {
    allowed,
    editable,
    canEdit: editable && age < WHATSAPP_EDIT_WINDOW_MS,
    canDelete: allowed && age < WHATSAPP_DELETE_WINDOW_MS,
  };
}
