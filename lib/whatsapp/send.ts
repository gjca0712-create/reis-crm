import { sendWhatsAppMessage as sendViaBaileys, sendWhatsAppMedia as sendMediaViaBaileys, type OutboundMedia } from "./client";
import { sendViaBradial, isBradialConfigured } from "./bradial";
import type { WhatsAppLineId } from "./lines";

// Ponto único de envio usado pelo resto do app (suporte, pedido de avaliação).
// Recebe a linha (lib/whatsapp/lines.ts) por onde mandar — normalmente a mesma
// que recebeu a conversa. Se o Bradial (API oficial) estiver configurado, manda
// por ele; senão cai na conexão não-oficial (Baileys/QR) daquela linha.
export async function sendWhatsAppMessage(
  line: WhatsAppLineId,
  phone: string,
  text: string
): Promise<boolean> {
  if (isBradialConfigured()) {
    return sendViaBradial(phone, text);
  }
  return sendViaBaileys(line, phone, text);
}

// Envio de mídia (foto, documento, áudio). Só implementado via Baileys por
// enquanto — o Bradial nunca chegou a ser configurado em produção, e enviar
// mídia pela API oficial exige outro formato de payload (não é só trocar aqui).
export async function sendWhatsAppMedia(line: WhatsAppLineId, phone: string, media: OutboundMedia): Promise<boolean> {
  if (isBradialConfigured()) {
    console.error("Envio de mídia via Bradial ainda não está implementado.");
    return false;
  }
  return sendMediaViaBaileys(line, phone, media);
}
