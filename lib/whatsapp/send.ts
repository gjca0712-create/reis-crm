import { sendWhatsAppMessage as sendViaBaileys } from "./client";
import { sendViaBradial, isBradialConfigured } from "./bradial";

// Ponto único de envio usado pelo resto do app (suporte, pedido de avaliação,
// campanhas). Se o Bradial estiver configurado (BRADIAL_API_URL +
// BRADIAL_API_TOKEN no .env), manda pela API oficial; senão cai na conexão
// não-oficial (Baileys/QR) como hoje. No dia que a Reis passar o acesso ao
// Bradial, basta preencher o .env — nenhum outro arquivo do app precisa mudar.
export async function sendWhatsAppMessage(phone: string, text: string): Promise<boolean> {
  if (isBradialConfigured()) {
    return sendViaBradial(phone, text);
  }
  return sendViaBaileys(phone, text);
}
