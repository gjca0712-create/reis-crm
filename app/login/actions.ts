"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import type { Role } from "@/lib/constants";
import { canAccess, defaultRouteFor, type Feature } from "@/lib/permissions";

// Mapeia rota -> feature pra saber se o papel logado pode mesmo acessar o
// "next" pedido (ex: veio de um link direto ou de um redirect do middleware).
const ROUTE_FEATURES: [string, Feature][] = [
  ["/dashboard", "dashboard"],
  ["/indicadores", "indicadores"],
  ["/vendas", "vendas"],
  ["/bairros", "bairros"],
  ["/whatsapp/suporte", "whatsapp_suporte"],
  ["/whatsapp/campanhas", "whatsapp_campanhas"],
  ["/atendentes", "atendentes"],
  ["/avaliacoes", "avaliacoes"],
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

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !valid) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

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
  redirect("/login");
}
