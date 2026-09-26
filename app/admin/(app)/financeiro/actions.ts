"use server";

import { revalidatePath } from "next/cache";
import { requireCeo } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { generateDemoData, clearDemoData } from "@/lib/erp/demo";
import { getErpDataStatus } from "@/lib/erp/queries";

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
