"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { requireCeo } from "@/lib/session";
import { CUSTOMIZABLE_FEATURES, type Feature } from "@/lib/permissions";

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

  revalidatePath("/admin/atendentes");
  redirect("/admin/atendentes");
}

// Salva a lista personalizada de telas que esse usuário específico pode ver,
// substituindo o padrão do perfil (role) dele. "atendentes" nunca é aceito
// aqui mesmo que alguém manipule o form manualmente — só quem já é CEO tem
// essa tela, e isso é decidido pelo role, não por essa lista (ver permissions.ts).
export async function updatePermissions(formData: FormData) {
  const ceo = await requireCeo();

  const userId = str(formData, "userId");
  if (!userId) throw new Error("Usuário não informado.");
  if (userId === ceo.userId) {
    throw new Error("Você não pode editar suas próprias permissões.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Usuário não encontrado.");
  if (user.role === "CEO") {
    throw new Error("Permissões de outro CEO não podem ser restringidas por aqui.");
  }

  const selected = CUSTOMIZABLE_FEATURES.filter((f) => formData.get(f) === "on") as Feature[];

  await prisma.user.update({ where: { id: userId }, data: { featureOverrides: selected } });

  revalidatePath(`/admin/atendentes/${userId}`);
  revalidatePath("/admin/atendentes");
}

// Volta esse usuário a usar o padrão de telas do perfil dele (role), apagando
// qualquer personalização feita antes.
export async function resetPermissions(formData: FormData) {
  const ceo = await requireCeo();

  const userId = str(formData, "userId");
  if (!userId) throw new Error("Usuário não informado.");
  if (userId === ceo.userId) {
    throw new Error("Você não pode editar suas próprias permissões.");
  }

  await prisma.user.update({ where: { id: userId }, data: { featureOverrides: Prisma.JsonNull } });

  revalidatePath(`/admin/atendentes/${userId}`);
  revalidatePath("/admin/atendentes");
}
