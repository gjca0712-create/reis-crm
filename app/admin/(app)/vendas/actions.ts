"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { recordSale } from "@/lib/sales";
import { requireFeature } from "@/lib/session";

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

type ItemInput = { productName: string; quantity: number; unitPrice: number };

function parseItems(raw: string): ItemInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => ({
      productName: typeof item?.productName === "string" ? item.productName.trim() : "",
      quantity: Number(item?.quantity),
      unitPrice: Number(item?.unitPrice),
    }))
    .filter((item) => item.productName && item.quantity > 0 && item.unitPrice >= 0);
}

// Regra central do negócio: o cashback vai para o indicador da venda (pedreiro,
// eletricista, etc.), nunca para o cliente que efetivamente comprou. O total é
// sempre recalculado aqui a partir dos itens — nunca confiamos num total vindo do cliente.
export async function createSale(formData: FormData) {
  await requireFeature("vendas");

  const customerId = str(formData, "customerId");
  const partnerId = str(formData, "partnerId") || null;
  const notes = str(formData, "notes") || null;
  const dateRaw = str(formData, "date");
  const deliveryStatus = str(formData, "deliveryStatus") || "SEPARACAO";
  const items = parseItems(str(formData, "itemsJson"));

  if (!customerId || items.length === 0) {
    throw new Error("Selecione o cliente e adicione pelo menos um item com quantidade e preço válidos.");
  }

  const total = Math.round(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100) / 100;
  if (total <= 0) {
    throw new Error("O total da venda precisa ser maior que zero.");
  }

  const date = dateRaw ? new Date(`${dateRaw}T12:00:00`) : new Date();

  await recordSale({ customerId, partnerId, items, notes, date, deliveryStatus });

  revalidatePath("/admin/vendas");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/bairros");
  revalidatePath("/admin/indicadores");
  if (partnerId) revalidatePath(`/admin/indicadores/${partnerId}`);
  revalidatePath(`/admin/clientes/${customerId}`);
  revalidatePath("/admin/clientes");

  redirect("/admin/vendas");
}

export async function updateDeliveryStatus(saleId: string, deliveryStatus: string) {
  await requireFeature("vendas");

  await prisma.sale.update({ where: { id: saleId }, data: { deliveryStatus } });

  revalidatePath("/admin/vendas");
}
