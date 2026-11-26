import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Compra do cliente = venda lançada no CRM (Sale) ou atendimento do WhatsApp
// marcado Venda (Conversation.outcome, valor em outcomeValue). Vale pro total
// gasto e pra recência (ficha, lista de clientes, painel e campanhas).
// O orçamento antigo que "virou venda" porque o cliente comprou numa conversa
// nova continua Orçamento — a venda é a da conversa nova, então não conta duas
// vezes. Venda do WhatsApp não dá pontos nem cashback (isso é só da Sale).

// Quando foi a compra pelo WhatsApp: quando marcaram Venda (sem essa data,
// quando a conversa abriu).
export function whatsappSaleDate(c: { outcomeAt: Date | null; createdAt: Date }): Date {
  return c.outcomeAt ?? c.createdAt;
}

// Filtro do Prisma: conversa marcada Venda (depois de `since`, se vier).
export function whatsappSaleWhere(since?: Date): Prisma.ConversationWhereInput {
  if (!since) return { outcome: "VENDA" };
  return { outcome: "VENDA", OR: [{ outcomeAt: { gt: since } }, { outcomeAt: null, createdAt: { gt: since } }] };
}

// Última compra pelo WhatsApp de cada cliente (sem ids = de todos).
export async function lastWhatsappSales(customerIds?: string[]): Promise<Map<string, Date>> {
  if (customerIds && customerIds.length === 0) return new Map();
  const rows = await prisma.conversation.groupBy({
    by: ["customerId"],
    where: { ...whatsappSaleWhere(), ...(customerIds ? { customerId: { in: customerIds } } : {}) },
    _max: { outcomeAt: true, createdAt: true },
  });
  const map = new Map<string, Date>();
  for (const r of rows) {
    const date = r._max.outcomeAt ?? r._max.createdAt;
    if (date) map.set(r.customerId, date);
  }
  return map;
}

// A mais recente das duas (ou null se nunca comprou).
export function lastPurchaseDate(saleDate: Date | null | undefined, whatsappDate: Date | null | undefined): Date | null {
  if (!saleDate) return whatsappDate ?? null;
  if (!whatsappDate) return saleDate;
  return saleDate > whatsappDate ? saleDate : whatsappDate;
}
