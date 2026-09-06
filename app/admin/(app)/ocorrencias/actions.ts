"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/session";

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function createOccurrence(formData: FormData) {
  const session = await requireFeature("ocorrencias");

  const type = str(formData, "type");
  const description = str(formData, "description") || null;
  const customerId = str(formData, "customerId") || null;
  const saleId = str(formData, "saleId") || null;

  if (!type) {
    throw new Error("Selecione o tipo da ocorrência.");
  }

  await prisma.occurrence.create({
    data: { type, description, customerId, saleId, reportedById: session.userId },
  });

  revalidatePath("/admin/ocorrencias");
  redirect("/admin/ocorrencias");
}
