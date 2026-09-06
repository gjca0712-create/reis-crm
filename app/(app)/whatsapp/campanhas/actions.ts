"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { recencyBucket } from "@/lib/calculations";
import { requireFeature } from "@/lib/session";

const SEGMENT_LABELS: Record<string, string> = {
  todos: "Todos os clientes",
  "recencia-30": "Compraram nos últimos 30 dias",
  "recencia-60": "Compraram nos últimos 60 dias",
  "recencia-90": "Compraram nos últimos 90 dias",
  inativos: "Inativos (90+ dias sem comprar)",
  "sem-compra": "Nunca compraram (leads)",
};

async function calcAudienceSize(segmentType: string): Promise<number> {
  if (segmentType === "todos") {
    return prisma.customer.count();
  }

  const customers = await prisma.customer.findMany({
    select: { sales: { select: { date: true }, orderBy: { date: "desc" }, take: 1 } },
  });

  return customers.filter((c) => {
    const bucket = recencyBucket(c.sales[0]?.date ?? null);
    if (segmentType === "recencia-30") return bucket === "30";
    if (segmentType === "recencia-60") return bucket === "60";
    if (segmentType === "recencia-90") return bucket === "90";
    if (segmentType === "inativos") return bucket === "inativo";
    if (segmentType === "sem-compra") return bucket === "sem-compra";
    return false;
  }).length;
}

export async function createCampaign(formData: FormData) {
  await requireFeature("whatsapp_campanhas");

  const name = String(formData.get("name") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const segmentType = String(formData.get("segmentType") || "todos");

  if (!name || !message) {
    throw new Error("Nome e mensagem são obrigatórios.");
  }

  const audienceSize = await calcAudienceSize(segmentType);

  await prisma.campaign.create({
    data: {
      name,
      message,
      segment: SEGMENT_LABELS[segmentType] ?? segmentType,
      audienceSize,
      status: "RASCUNHO",
    },
  });

  revalidatePath("/whatsapp/campanhas");
  redirect("/whatsapp/campanhas");
}

// Simula o disparo via API oficial do WhatsApp. A integração real (Meta Cloud API)
// exige número comercial verificado, token de acesso e template de mensagem aprovado.
export async function sendCampaign(campaignId: string) {
  await requireFeature("whatsapp_campanhas");

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "ENVIADA", sentAt: new Date() },
  });

  revalidatePath("/whatsapp/campanhas");
}
