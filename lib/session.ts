import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionPayload } from "./auth";
import { prisma } from "./prisma";
import type { Role } from "./constants";
import { canAccess, defaultRouteFor, resolveFeatures, type Feature } from "./permissions";

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// Busca as permissões efetivas direto no banco em vez de confiar só no que
// está gravado no token (que dura 30 dias) — assim, quando o CEO restringe ou
// libera uma tela pra alguém, o efeito é imediato, não só no próximo login.
export async function getSessionFeatures(session: SessionPayload): Promise<Feature[]> {
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, featureOverrides: true },
  });
  if (!user) return [];
  return resolveFeatures(user.role as Role, user.featureOverrides);
}

// Para páginas de gestão de equipe (criar usuário, editar permissões) restritas
// ao CEO — checagem de role, não de feature (ver CEO_ONLY_FEATURES em permissions.ts).
export async function requireCeo(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "CEO") {
    redirect("/admin/dashboard");
  }
  return session;
}

// Guarda genérica por permissão — usar no topo de toda página/server action
// que não seja liberada pra todo mundo. Manda quem não tem acesso pra primeira
// tela que ele consegue ver, em vez de sempre /dashboard.
export async function requireFeature(feature: Feature): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect("/admin/login");
  }
  const features = await getSessionFeatures(session);
  if (!canAccess(features, feature)) {
    redirect(defaultRouteFor(features));
  }
  return session;
}
