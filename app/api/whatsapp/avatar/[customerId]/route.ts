import { NextResponse, type NextRequest } from "next/server";
import { getSession, getSessionFeatures } from "@/lib/session";
import { canAccess } from "@/lib/permissions";
import { loadCustomerAvatar } from "@/lib/whatsapp/avatar";

export const dynamic = "force-dynamic";

// Foto de perfil do WhatsApp do cliente (?tamanho=grande pra tela de dados do
// contato). Mesma permissão dos anexos do Suporte.
export async function GET(request: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await getSession();
  const features = session ? await getSessionFeatures(session) : [];
  // Mensagens antigas (whatsapp_gestao) também mostra foto e anexos.
  if (!session || (!canAccess(features, "whatsapp_suporte") && !canAccess(features, "whatsapp_gestao"))) {
    return new NextResponse("Não autorizado", { status: 401 });
  }

  const { customerId } = await params;
  const size = request.nextUrl.searchParams.get("tamanho") === "grande" ? "image" : "preview";
  const image = await loadCustomerAvatar(customerId, size).catch((err) => {
    console.error("Erro ao carregar foto de perfil:", err);
    return null;
  });
  // Sem foto também fica guardado no navegador por 1 hora, senão cada
  // atualização da lista perguntaria de novo.
  if (!image) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });
  return new NextResponse(new Uint8Array(image), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
  });
}
