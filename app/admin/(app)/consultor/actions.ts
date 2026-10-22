"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, getSessionFeatures, requireCeo } from "@/lib/session";
import { canAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { SOBRE_EMPRESA_MAX_CARACTERES } from "@/lib/consultor/config";
import { getConsultorRegras } from "@/lib/consultor/settings";

// 👍/👎 numa resposta: é o que mostra onde a IA erra pra ajustar as regras.
// Só vale pra resposta das conversas do próprio usuário.
export async function setFeedbackAction(mensagemId: string, valor: 1 | -1 | 0): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session || !canAccess(await getSessionFeatures(session), "consultor")) return { ok: false };
  if (![1, -1, 0].includes(valor)) return { ok: false };
  const { count } = await prisma.consultorMessage.updateMany({
    where: { id: mensagemId, role: "assistant", conversation: { userId: session.userId } },
    data: { feedback: valor === 0 ? null : valor },
  });
  return { ok: count === 1 };
}

const regrasSchema = z.object({
  margemMinima: z.coerce.number().min(0, "Margem mínima entre 0 e 90%.").max(90, "Margem mínima entre 0 e 90%."),
  descontoMaximo: z.coerce.number().min(0, "Desconto máximo entre 0 e 90%.").max(90, "Desconto máximo entre 0 e 90%."),
  limiteDiario: z.coerce.number().int("Limite diário: número inteiro.").min(1, "Limite diário entre 1 e 500.").max(500, "Limite diário entre 1 e 500."),
  sobreEmpresa: z.string().trim().max(SOBRE_EMPRESA_MAX_CARACTERES, `"Sobre a loja" passou de ${SOBRE_EMPRESA_MAX_CARACTERES} caracteres.`),
});

export type RegrasFormState = { ok?: boolean; erro?: string } | undefined;

// Regras de oferta e o texto "sobre a loja" entram no texto fixo da IA — só o CEO muda.
export async function saveConsultorSettingsAction(_prev: RegrasFormState, formData: FormData): Promise<RegrasFormState> {
  const ceo = await requireCeo();
  const parsed = regrasSchema.safeParse({
    margemMinima: String(formData.get("margemMinima") ?? "").replace(",", "."),
    descontoMaximo: String(formData.get("descontoMaximo") ?? "").replace(",", "."),
    limiteDiario: formData.get("limiteDiario"),
    sobreEmpresa: formData.get("sobreEmpresa") ?? "",
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Valores inválidos." };

  const antes = await getConsultorRegras();
  const dados = { ...parsed.data, updatedBy: ceo.name };
  await prisma.consultorSettings.upsert({ where: { id: "consultor" }, create: { id: "consultor", ...dados }, update: dados });
  await logAudit({
    actor: ceo,
    action: "consultor.settings_update",
    details: {
      antes: { margemMinima: antes.margemMinima, descontoMaximo: antes.descontoMaximo, limiteDiario: antes.limiteDiario },
      depois: { margemMinima: dados.margemMinima, descontoMaximo: dados.descontoMaximo, limiteDiario: dados.limiteDiario },
      sobreEmpresaMudou: antes.sobreEmpresa.trim() !== dados.sobreEmpresa,
    },
  });

  revalidatePath("/admin/consultor");
  return { ok: true };
}
