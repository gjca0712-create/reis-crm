import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionPayload } from "./auth";
import { canAccess, defaultRouteFor, type Feature } from "./permissions";

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// Para páginas de gestão de equipe (Atendentes, Avaliações) restritas ao CEO.
export async function requireCeo(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "CEO") {
    redirect("/admin/dashboard");
  }
  return session;
}

// Guarda genérica por permissão de papel — usar no topo de toda página/server
// action que não seja liberada pra todo mundo. Manda quem não tem acesso pra
// primeira tela que o papel dele consegue ver, em vez de sempre /dashboard.
export async function requireFeature(feature: Feature): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect("/admin/login");
  }
  if (!canAccess(session.role, feature)) {
    redirect(defaultRouteFor(session.role));
  }
  return session;
}
