"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/session";
import { normalizePhone } from "@/lib/phone";

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

// Input de <input type="date"> vem como "YYYY-MM-DD"; ancoramos ao meio-dia
// local pra não correr risco de virar o dia anterior/seguinte por fuso.
function parseDateInput(raw: string): Date | null {
  return raw ? new Date(`${raw}T12:00:00`) : null;
}

export async function createCustomer(formData: FormData) {
  await requireFeature("clientes");

  const name = str(formData, "name");
  const phone = normalizePhone(str(formData, "phone"));
  const bairro = str(formData, "bairro");
  if (!name || !phone || !bairro) {
    throw new Error("Nome, telefone e bairro são obrigatórios.");
  }

  const referredById = str(formData, "referredById");

  const customer = await prisma.customer.create({
    data: {
      name,
      phone,
      bairro,
      email: str(formData, "email") || null,
      document: str(formData, "document") || null,
      address: str(formData, "address") || null,
      city: str(formData, "city") || "",
      notes: str(formData, "notes") || null,
      referredById: referredById || undefined,
      birthday: parseDateInput(str(formData, "birthday")),
      faseObra: str(formData, "faseObra") || null,
    },
  });

  revalidatePath("/admin/clientes");
  redirect(`/admin/clientes/${customer.id}`);
}

export async function updateCustomer(customerId: string, formData: FormData) {
  await requireFeature("clientes");

  const name = str(formData, "name");
  const phone = normalizePhone(str(formData, "phone"));
  const bairro = str(formData, "bairro");
  if (!name || !phone || !bairro) {
    throw new Error("Nome, telefone e bairro são obrigatórios.");
  }

  const referredById = str(formData, "referredById");

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      name,
      phone,
      bairro,
      email: str(formData, "email") || null,
      document: str(formData, "document") || null,
      address: str(formData, "address") || null,
      city: str(formData, "city") || "",
      notes: str(formData, "notes") || null,
      referredById: referredById || null,
      birthday: parseDateInput(str(formData, "birthday")),
      faseObra: str(formData, "faseObra") || null,
    },
  });

  revalidatePath("/admin/clientes");
  revalidatePath(`/admin/clientes/${customerId}`);
  redirect(`/admin/clientes/${customerId}`);
}
