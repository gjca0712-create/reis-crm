import { prisma } from "@/lib/prisma";
import { calcPoints, calcCashback } from "@/lib/calculations";

export type SaleItemInput = { productName: string; quantity: number; unitPrice: number };

// Lógica central de gravação de uma venda — usada tanto pelo formulário interno
// (vendas/actions.ts) quanto pela API pública do site (api/site/pedidos). O
// cashback só existe quando há indicador; o site não escolhe indicador.
export async function recordSale(params: {
  customerId: string;
  partnerId?: string | null;
  items: SaleItemInput[];
  notes?: string | null;
  date?: Date;
  deliveryStatus?: string;
}) {
  const { customerId, items, notes = null, date = new Date(), deliveryStatus = "SEPARACAO" } = params;
  const partnerId = params.partnerId || null;

  const total = Math.round(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100) / 100;
  const pointsEarned = calcPoints(total);
  const cashbackAmount = partnerId ? calcCashback(total) : 0;

  const sale = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.create({
      data: {
        customerId,
        partnerId: partnerId ?? undefined,
        total,
        notes,
        pointsEarned,
        cashbackAmount,
        deliveryStatus,
        date,
      },
    });

    await tx.saleItem.createMany({
      data: items.map((item) => ({
        saleId: sale.id,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
      })),
    });

    await tx.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: { increment: pointsEarned } },
    });

    await tx.loyaltyTransaction.create({
      data: { customerId, points: pointsEarned, type: "EARNED", reference: `Compra #${sale.id.slice(-6)}` },
    });

    if (partnerId && cashbackAmount > 0) {
      await tx.partner.update({
        where: { id: partnerId },
        data: { cashbackBalance: { increment: cashbackAmount } },
      });
      await tx.cashbackTransaction.create({
        data: { partnerId, amount: cashbackAmount, type: "EARNED", saleId: sale.id },
      });
    }

    return sale;
  });

  return { sale, total, pointsEarned, cashbackAmount };
}
