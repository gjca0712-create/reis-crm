"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { requireCeo } from "@/lib/session";
import { CUSTOMIZABLE_FEATURES, type Feature } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import type { Role } from "@/lib/constants";

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

const VALID_ROLES: Role[] = ["CEO", "GERENTE", "VENDEDOR", "ATENDENTE"];

export async function createAgent(formData: FormData) {
  const ceo = await requireCeo();

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
  const created = await prisma.user.create({ data: { name, email, passwordHash, role } });

  await logAudit({
    actor: ceo,
    action: "user.create",
    targetId: created.id,
    targetLabel: created.email,
    details: { name, role },
  });

  revalidatePath("/admin/atendentes");
  redirect("/admin/atendentes");
}

// Salva a lista personalizada de telas que esse usuário específico pode ver,
// substituindo o padrão do perfil (role) dele. "atendentes"/"auditoria" nunca
// são aceitos aqui mesmo que alguém manipule o form manualmente — só quem já é
// CEO tem essas telas, e isso é decidido pelo role, não por essa lista (ver
// permissions.ts).
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

  await logAudit({
    actor: ceo,
    action: "user.permissions_update",
    targetId: user.id,
    targetLabel: user.email,
    details: { before: user.featureOverrides ?? null, after: selected },
  });

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

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Usuário não encontrado.");

  await prisma.user.update({ where: { id: userId }, data: { featureOverrides: Prisma.JsonNull } });

  await logAudit({
    actor: ceo,
    action: "user.permissions_reset",
    targetId: user.id,
    targetLabel: user.email,
    details: { before: user.featureOverrides ?? null },
  });

  revalidatePath(`/admin/atendentes/${userId}`);
  revalidatePath("/admin/atendentes");
}

// Edita nome/e-mail/perfil de um usuário existente. Impede que o próprio CEO
// tire seu papel de CEO por aqui — isso o trancaria fora da gestão de equipe
// pra sempre (ninguém mais poderia devolver o acesso).
export async function updateUserInfo(formData: FormData) {
  const ceo = await requireCeo();

  const userId = str(formData, "userId");
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const roleInput = str(formData, "role");

  if (!userId) throw new Error("Usuário não informado.");
  if (!name || !email) throw new Error("Nome e e-mail são obrigatórios.");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Usuário não encontrado.");

  const role: Role = VALID_ROLES.includes(roleInput as Role) ? (roleInput as Role) : (user.role as Role);

  if (userId === ceo.userId && role !== "CEO") {
    throw new Error("Você não pode remover seu próprio papel de CEO.");
  }

  if (email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new Error("Já existe um usuário com esse e-mail.");
  }

  await prisma.user.update({ where: { id: userId }, data: { name, email, role } });

  await logAudit({
    actor: ceo,
    action: "user.update",
    targetId: user.id,
    targetLabel: email,
    details: {
      before: { name: user.name, email: user.email, role: user.role },
      after: { name, email, role },
    },
  });

  revalidatePath(`/admin/atendentes/${userId}`);
  revalidatePath("/admin/atendentes");
}

// Redefine a senha de um usuário (ex: ele esqueceu e não existe fluxo de "recuperar
// senha" por e-mail nesse CRM). O valor da senha nunca entra no log de auditoria.
export async function resetUserPassword(formData: FormData) {
  const ceo = await requireCeo();

  const userId = str(formData, "userId");
  const password = str(formData, "password");

  if (!userId) throw new Error("Usuário não informado.");
  if (password.length < 6) {
    throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Usuário não encontrado.");

  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  await logAudit({
    actor: ceo,
    action: "user.password_reset",
    targetId: user.id,
    targetLabel: user.email,
  });

  revalidatePath(`/admin/atendentes/${userId}`);
}
