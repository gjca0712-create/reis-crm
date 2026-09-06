import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifyApiKey, CORS_HEADERS } from "@/lib/apiAuth";
import { recordSale, type SaleItemInput } from "@/lib/sales";

type ItemPayload = { productName?: unknown; quantity?: unknown; unitPrice?: unknown };

function parseItems(raw: unknown): SaleItemInput[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ItemPayload[])
    .map((item) => ({
      productName: typeof item?.productName === "string" ? item.productName.trim() : "",
      quantity: Number(item?.quantity),
      unitPrice: Number(item?.unitPrice),
    }))
    .filter((item) => item.productName && item.quantity > 0 && item.unitPrice >= 0);
}

// Recebe um pedido fechado no site (cliente + itens) e grava como venda no
// CRM — mesma lógica de pontos/cashback da venda registrada manualmente, só
// que sem indicador (o site não tem como saber quem indicou o cliente).
export async function POST(request: Request) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const bairro = typeof body?.bairro === "string" ? body.bairro.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : null;
  const address = typeof body?.address === "string" ? body.address.trim() : null;
  const items = parseItems(body?.items);

  if (!name || !phone || !bairro) {
    return NextResponse.json({ error: "name, phone e bairro são obrigatórios" }, { status: 400, headers: CORS_HEADERS });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "items precisa ter ao menos 1 item válido" }, { status: 400, headers: CORS_HEADERS });
  }

  let customer = await prisma.customer.findFirst({ where: { phone } });
  if (!customer) {
    customer = await prisma.customer.create({ data: { name, phone, bairro, email, address } });
  }

  const { sale } = await recordSale({ customerId: customer.id, items, notes: "Pedido feito pelo site" });

  revalidatePath("/admin/vendas");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/bairros");
  revalidatePath(`/admin/clientes/${customer.id}`);
  revalidatePath("/admin/clientes");

  return NextResponse.json({ saleId: sale.id, customerId: customer.id }, { status: 201, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
