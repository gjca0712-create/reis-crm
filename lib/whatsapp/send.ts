import {
  sendWhatsAppText as sendTextViaBaileys,
  sendWhatsAppMedia as sendMediaViaBaileys,
  type OutboundMedia,
  type WaSendResult,
} from "./client";
import { sendViaBradial, isBradialConfigured } from "./bradial";
import type { WhatsAppLineId } from "./lines";

// Destinatário: o telefone, e o @lid do WhatsApp quando o cliente já escreveu
// por ele (Customer.whatsappLid — ver recipientJids em client.ts).
export type WhatsAppRecipient = { phone: string; whatsappLid?: string | null };

// Ponto único de envio usado pelo resto do app (suporte, pedido de avaliação).
// Recebe a linha (lib/whatsapp/lines.ts) por onde mandar — normalmente a mesma
// que recebeu a conversa. Se o Bradial (API oficial) estiver configurado, manda
// por ele; senão cai na conexão não-oficial (Baileys/QR) daquela linha.
// `ref` (onde a mensagem ficou no WhatsApp) só existe pelo Baileys — pelo
// Bradial a mensagem sai, mas não dá pra apagar/editar depois pelo CRM.
export async function sendWhatsAppMessage(
  line: WhatsAppLineId,
  to: WhatsAppRecipient,
  text: string
): Promise<WaSendResult> {
  if (isBradialConfigured()) {
    return { sent: await sendViaBradial(to.phone, text), ref: null };
  }
  return sendTextViaBaileys(line, to.phone, text, to.whatsappLid);
}

// Envio de mídia (foto, documento, áudio). Só implementado via Baileys por
// enquanto — o Bradial nunca chegou a ser configurado em produção, e enviar
// mídia pela API oficial exige outro formato de payload (não é só trocar aqui).
export async function sendWhatsAppMedia(
  line: WhatsAppLineId,
  to: WhatsAppRecipient,
  media: OutboundMedia
): Promise<WaSendResult> {
  if (isBradialConfigured()) {
    console.error("Envio de mídia via Bradial ainda não está implementado.");
    return { sent: false, ref: null };
  }
  return sendMediaViaBaileys(line, to.phone, media, to.whatsappLid);
}
