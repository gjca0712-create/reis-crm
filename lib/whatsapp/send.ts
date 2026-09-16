import { sendWhatsAppMessage as sendViaBaileys } from "./client";
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
