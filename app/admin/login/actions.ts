"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import type { Role } from "@/lib/constants";
import { canAccess, defaultRouteFor, type Feature } from "@/lib/permissions";
import { isLoginLocked, registerFailedLogin, clearLoginAttempts } from "@/lib/rateLimit";

// Mapeia rota -> feature pra saber se o papel logado pode mesmo acessar o
// "next" pedido (ex: veio de um link direto ou de um redirect do middleware).
const ROUTE_FEATURES: [string, Feature][] = [
  ["/admin/dashboard", "dashboard"],
  ["/admin/indicadores", "indicadores"],
  ["/admin/vendas", "vendas"],
  ["/admin/bairros", "bairros"],
  ["/admin/whatsapp/suporte", "whatsapp_suporte"],
  ["/admin/whatsapp/campanhas", "whatsapp_campanhas"],
  ["/admin/atendentes", "atendentes"],
  ["/admin/avaliacoes", "avaliacoes"],
];

function resolveNext(requested: string, role: Role): string {
  const match = ROUTE_FEATURES.find(([prefix]) => requested === prefix || requested.startsWith(`${prefix}/`));
  if (match && !canAccess(role, match[1])) {
    return defaultRouteFor(role);
  }
  return requested || defaultRouteFor(role);
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "");

  // Trava por e-mail (não por IP) — mais simples e já barra o caso comum de
  // alguém tentando adivinhar a senha de uma conta específica.
  if (email) {
    const lock = isLoginLocked(email);
    if (lock.locked) {
      redirect(`/admin/login?error=locked&retry=${lock.retryAfterSeconds}&next=${encodeURIComponent(next)}`);
    }
  }

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !valid) {
    if (email) registerFailedLogin(email);
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }

  if (email) clearLoginAttempts(email);

  const role = user.role as Role;

  const token = await createSessionToken({
    userId: user.id,
    name: user.name,
    email: user.email,
    role,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(resolveNext(next, role));
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/admin/login");
}
