"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/session";

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function markLeadStatus(leadId: string, status: string) {
  await requireFeature("leads");

  await prisma.lead.update({ where: { id: leadId }, data: { status } });

  revalidatePath("/leads");
}

// Vira Customer de verdade — o lead só traz nome/telefone/e-mail, então o
// bairro (obrigatório em Customer) é escolhido pelo vendedor na hora de converter.
export async function convertLead(leadId: string, formData: FormData) {
  await requireFeature("leads");

  const bairro = str(formData, "bairro");
  if (!bairro) {
    throw new Error("Selecione o bairro do cliente pra converter o lead.");
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;

  await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: { name: lead.name, phone: lead.phone, email: lead.email, bairro },
    });
    await tx.lead.update({
      where: { id: leadId },
      data: { status: "CONVERTIDO", convertedCustomerId: customer.id },
    });
  });

  revalidatePath("/leads");
  revalidatePath("/clientes");
}
