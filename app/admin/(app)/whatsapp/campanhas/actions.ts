"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/session";
import { getSegmentCustomers, type CampaignCustomer } from "@/lib/campaigns";
import { DEFAULT_WHATSAPP_LINE } from "@/lib/whatsapp/lines";
import { getWhatsAppState, sendWhatsAppMessage, isSendablePhone } from "@/lib/whatsapp/client";
import { logAudit } from "@/lib/audit";
import type { SessionPayload } from "@/lib/auth";

export async function createCampaign(formData: FormData) {
  await requireFeature("whatsapp_campanhas");

  const name = String(formData.get("name") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const segmentType = String(formData.get("segmentType") || "todos");

  if (!name || !message) {
    throw new Error("Nome e mensagem são obrigatórios.");
  }

  const audienceSize = (await getSegmentCustomers(segmentType)).length;

  await prisma.campaign.create({
    data: { name, message, segment: segmentType, audienceSize, status: "RASCUNHO" },
  });

  revalidatePath("/admin/whatsapp/campanhas");
  redirect("/admin/whatsapp/campanhas");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Espera um tempo aleatório entre cada mensagem em vez de mandar tudo em
// rajada — a conexão usada aqui é a mesma do WhatsApp Suporte (Baileys, não é
// a API comercial oficial da Meta), e disparo muito rápido pra muitos números
// é o padrão mais comum de bloqueio automático de número pelo WhatsApp.
function randomDelayMs() {
  return 4000 + Math.random() * 5000;
}

// Roda em segundo plano (não é aguardado por quem chamou) — o processo do
// Railway continua de pé mesmo depois da resposta da server action voltar pro
// navegador, então o disparo segue mesmo se o CEO sair da tela.
async function runCampaignSend(
  campaignId: string,
  customers: CampaignCustomer[],
  message: string,
  actor: SessionPayload
) {
  let sent = 0;

  for (const customer of customers) {
    if (isSendablePhone(customer.phone)) {
      const ok = await sendWhatsAppMessage(DEFAULT_WHATSAPP_LINE, customer.phone, message);
      if (ok) sent++;
    }

    await prisma.campaign.update({ where: { id: campaignId }, data: { sentCount: sent } }).catch(() => {});
    await sleep(randomDelayMs());
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "ENVIADA", sentAt: new Date(), sentCount: sent },
  });

  await logAudit({
    actor,
    action: "campaign.send",
    targetId: campaignId,
    details: { audienceSize: customers.length, sentCount: sent },
  });
}

export async function sendCampaign(campaignId: string) {
  const session = await requireFeature("whatsapp_campanhas");

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campanha não encontrada.");
  if (campaign.status === "ENVIADA" || campaign.status === "ENVIANDO") {
    throw new Error("Essa campanha já foi disparada ou está em andamento.");
  }

  if (getWhatsAppState(DEFAULT_WHATSAPP_LINE).status !== "connected") {
    throw new Error(
      "O WhatsApp (Linha 1) não está conectado agora. Conecte em WhatsApp Suporte antes de disparar a campanha."
    );
  }

  const customers = await getSegmentCustomers(campaign.segment);
  if (customers.length === 0) {
    throw new Error("Nenhum cliente nesse segmento pra enviar.");
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "ENVIANDO", audienceSize: customers.length, sentCount: 0 },
  });

  void runCampaignSend(campaignId, customers, campaign.message, session);

  revalidatePath("/admin/whatsapp/campanhas");
}
