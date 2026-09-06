"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Profissao } from "@/lib/constants";
import { requireFeature } from "@/lib/session";

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function createPartner(formData: FormData) {
  await requireFeature("indicadores");

  const name = str(formData, "name");
  const phone = str(formData, "phone");
  const profissao = str(formData, "profissao") as Profissao;
  if (!name || !phone || !profissao) {
    throw new Error("Nome, telefone e profissão são obrigatórios.");
  }

  const partner = await prisma.partner.create({
    data: {
      name,
      phone,
      profissao,
      pixKey: str(formData, "pixKey") || null,
      notes: str(formData, "notes") || null,
    },
  });

  revalidatePath("/admin/indicadores");
  redirect(`/admin/indicadores/${partner.id}`);
}

export async function updatePartner(partnerId: string, formData: FormData) {
  await requireFeature("indicadores");

  const name = str(formData, "name");
  const phone = str(formData, "phone");
  const profissao = str(formData, "profissao") as Profissao;
  if (!name || !phone || !profissao) {
    throw new Error("Nome, telefone e profissão são obrigatórios.");
  }

  await prisma.partner.update({
    where: { id: partnerId },
    data: {
      name,
      phone,
      profissao,
      pixKey: str(formData, "pixKey") || null,
      notes: str(formData, "notes") || null,
    },
  });

  revalidatePath("/admin/indicadores");
  revalidatePath(`/admin/indicadores/${partnerId}`);
  redirect(`/admin/indicadores/${partnerId}`);
}

// Marca um valor como pago ao indicador (ex: via Pix) e desconta do saldo de cashback.
export async function registerCashbackPayout(partnerId: string, formData: FormData) {
  await requireFeature("indicadores");

  const amountRaw = str(formData, "amount");
  const amount = Number(amountRaw.replace(",", "."));
  if (!amount || amount <= 0) {
    throw new Error("Informe um valor válido para o pagamento.");
  }

  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) throw new Error("Indicador não encontrado.");
  if (amount > partner.cashbackBalance) {
    throw new Error("Valor maior que o saldo disponível.");
  }

  await prisma.$transaction([
    prisma.cashbackTransaction.create({
      data: { partnerId, amount: -amount, type: "PAID" },
    }),
    prisma.partner.update({
      where: { id: partnerId },
      data: { cashbackBalance: { decrement: amount } },
    }),
  ]);

  revalidatePath(`/admin/indicadores/${partnerId}`);
  revalidatePath("/admin/indicadores");
}
