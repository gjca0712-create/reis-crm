"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/session";
import { normalizePhone, phoneVariants } from "@/lib/phone";

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function markLeadStatus(leadId: string, status: string) {
  await requireFeature("leads");

  await prisma.lead.update({ where: { id: leadId }, data: { status } });

  revalidatePath("/admin/leads");
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

  const phone = normalizePhone(lead.phone);
  await prisma.$transaction(async (tx) => {
    // O mesmo telefone já existe (quase sempre um contato que mandou mensagem
    // no WhatsApp): aproveita esse cadastro em vez de criar outro repetido. Se
    // era só contato, ganha o nome, o e-mail e o bairro do lead e vira cliente.
    const existing = phone
      ? await tx.customer.findFirst({ where: { phone: { in: phoneVariants(phone) } }, orderBy: { createdAt: "asc" } })
      : null;
    const customer = !existing
      ? await tx.customer.create({ data: { name: lead.name, phone: phone || lead.phone, email: lead.email, bairro } })
      : existing.isContact
        ? await tx.customer.update({
            where: { id: existing.id },
            data: { name: lead.name, email: existing.email ?? lead.email, bairro, isContact: false },
          })
        : existing;
    await tx.lead.update({
      where: { id: leadId },
      data: { status: "CONVERTIDO", convertedCustomerId: customer.id },
    });
  });

  revalidatePath("/admin/leads");
  revalidatePath("/admin/clientes");
}
