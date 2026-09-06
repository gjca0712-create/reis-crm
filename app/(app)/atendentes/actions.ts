"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { requireCeo } from "@/lib/session";

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function createAgent(formData: FormData) {
  await requireCeo();

  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  const role = str(formData, "role") || "ATENDENTE";

  if (!name || !email || !password) {
    throw new Error("Nome, e-mail e senha são obrigatórios.");
  }
  if (password.length < 6) {
    throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("Já existe um usuário com esse e-mail.");
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({ data: { name, email, passwordHash, role } });

  revalidatePath("/atendentes");
  redirect("/atendentes");
}
