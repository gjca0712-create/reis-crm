import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import type { WhatsAppLineId } from "./lines";

// Lógica de processar mensagem recebida do WhatsApp, compartilhada entre os dois
// jeitos de receber mensagem que o CRM suporta: a conexão não-oficial (Baileys,
// lib/whatsapp/client.ts) e o webhook da API oficial via Bradial
// (app/api/whatsapp/bradial/webhook). Não depende do formato de nenhum dos dois —
// recebe a linha que recebeu a mensagem, o telefone (já sem DDI 55) e o texto.

function parseRatingReply(text: string): number | null {
  const match = text.trim().match(/^([1-5])$/);
  return match ? Number(match[1]) : null;
}

// Mesma forma canônica usada no cadastro (lib/phone.ts): só dígitos, sem DDI 55.
export function normalizeIncomingPhone(raw: string): string | null {
  const digits = normalizePhone(raw);
  return digits || null;
}

export async function processInboundWhatsAppMessage(
  line: WhatsAppLineId,
  phone: string,
  text: string
): Promise<void> {
  if (!phone || !text) return;

  let customer = await prisma.customer.findFirst({ where: { phone } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        name: `Contato ${phone.slice(-4)}`,
        phone,
        bairro: "Não informado",
        notes: "Cadastrado automaticamente a partir de uma mensagem recebida no WhatsApp.",
      },
    });
  }

  // Conversa mais recente do cliente NESSA linha — cada número tem seu próprio
  // fio; responder por outro número confundiria o cliente (remetente diferente).
  const conversation = await prisma.conversation.findFirst({
    where: { customerId: customer.id, line },
    orderBy: { lastMessageAt: "desc" },
  });

  // Se a conversa mais recente estava aguardando avaliação, tenta interpretar a resposta como nota.
  if (conversation?.ratingRequested) {
    const score = parseRatingReply(text);
    if (score) {
      await prisma.$transaction([
        prisma.rating.create({
          data: {
            conversationId: conversation.id,
            customerId: customer.id,
            agentId: conversation.resolvedById,
            score,
          },
        }),
        prisma.conversation.update({ where: { id: conversation.id }, data: { ratingRequested: false } }),
      ]);
      return;
    }
  }

  const target =
    conversation && conversation.status !== "RESOLVED"
      ? conversation
      : await prisma.conversation.create({
          data: { customerId: customer.id, line, status: "OPEN", lastMessageAt: new Date() },
        });

  await prisma.$transaction([
    prisma.message.create({ data: { conversationId: target.id, direction: "IN", body: text } }),
    prisma.conversation.update({ where: { id: target.id }, data: { lastMessageAt: new Date(), status: "OPEN" } }),
  ]);
}
