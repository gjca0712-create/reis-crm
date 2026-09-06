import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// /api/site é a API pública que o site externo chama, e /api/whatsapp/bradial
// é o webhook que o Bradial chama quando chega mensagem no número oficial —
// nenhum dos dois usa cookie de sessão, cada um tem sua própria autenticação
// (ver lib/apiAuth.ts e o token checado dentro da rota do webhook).
const PUBLIC_PATHS = ["/login", "/api/site", "/api/whatsapp/bradial"];

export async function middleware(request: NextRequest) {
  // O Next já tira o basePath ("/admin") de nextUrl.pathname por padrão, mas
  // normalizamos aqui de novo por segurança — assim a lógica abaixo (que
  // compara contra "/login", "/api/site" etc.) funciona igual não importa o
  // comportamento exato dessa versão do Next.
  const BASE_PATH = "/admin";
  let pathname = request.nextUrl.pathname;
  if (pathname.startsWith(BASE_PATH)) {
    pathname = pathname.slice(BASE_PATH.length) || "/";
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    // clone() em vez de `new URL(path, request.url)`: nextUrl já reaplica o
    // basePath sozinho ao montar a URL final — por isso o pathname aqui é
    // "/login" (sem "/admin"), senão o resultado sai duplicado ("/admin/admin/login").
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|reis-crown.png|reis-logo.png).*)"],
};
