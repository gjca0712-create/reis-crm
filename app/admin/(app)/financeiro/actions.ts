"use server";

import { revalidatePath } from "next/cache";
import { getSession, getSessionFeatures, requireCeo } from "@/lib/session";
import { canAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { generateDemoData, clearDemoData } from "@/lib/erp/demo";
import { getErpDataStatus } from "@/lib/erp/queries";
import { isFreshSyncRequest, requestSync } from "@/lib/erp/sync-request";

// Botão "Atualizar agora" (Financeiro e Produtos): quem vê uma das duas telas.
async function canSeeErp(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  const features = await getSessionFeatures(session);
  return canAccess(features, "financeiro") || canAccess(features, "produtos");
}

export async function requestErpSyncAction(): Promise<{ ok: boolean }> {
  if (!(await canSeeErp())) return { ok: false };
  await requestSync();
  return { ok: true };
}

// A tela pergunta a cada poucos segundos depois do clique; pending = false é a
// rodada da loja ter terminado (ou o pedido ter vencido: computador desligado).
export async function erpSyncRequestStatusAction(): Promise<{ pending: boolean; lastSyncAt: string | null }> {
  if (!(await canSeeErp())) return { pending: false, lastSyncAt: null };
  const state = await prisma.erpSyncState.findUnique({
    where: { id: "erp" },
    select: { requestedAt: true, lastSyncAt: true },
  });
  return { pending: isFreshSyncRequest(state?.requestedAt), lastSyncAt: state?.lastSyncAt?.toISOString() ?? null };
}

// Demonstração das telas do ERP (ver lib/erp/demo.ts). Só o CEO carrega/apaga,
// e nunca por cima de dado real: generateDemoData confere de novo, sob trava,
// se o ERP já começou a sincronizar.
export async function loadDemoDataAction() {
  const ceo = await requireCeo();
  const status = await getErpDataStatus();
  if (status.mode === "empty") {
    const result = await generateDemoData();
    if (!("skipped" in result)) await logAudit({ actor: ceo, action: "erp.demo_load", details: result });
  }

  revalidatePath("/admin/financeiro");
  revalidatePath("/admin/produtos");
}

export async function clearDemoDataAction() {
  const ceo = await requireCeo();
  await clearDemoData();
  await logAudit({ actor: ceo, action: "erp.demo_clear" });

  revalidatePath("/admin/financeiro");
  revalidatePath("/admin/produtos");
}
