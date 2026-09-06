import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Agora que CRM e site são um app só, o middleware só precisa proteger
// /admin/* — o resto (site institucional, /api/site/*, o webhook do Bradial)
// não passa mais por checagem de sessão nenhuma (matcher abaixo já filtra
// isso, então nem precisa de lista de PUBLIC_PATHS como antes).
const PUBLIC_ADMIN_PATHS = ["/admin/login"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = "";
    // "next" viaja com o prefixo /admin — login/actions.ts (resolveNext,
    // ROUTE_FEATURES) e lib/permissions.ts (defaultRouteFor) trabalham nesse
    // mesmo namespace desde a migração pra rota /admin/*.
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
