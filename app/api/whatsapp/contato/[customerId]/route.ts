import { NextResponse, type NextRequest } from "next/server";
import { getSession, getSessionFeatures } from "@/lib/session";
import { canAccess } from "@/lib/permissions";
import { loadCustomerAbout } from "@/lib/whatsapp/avatar";

export const dynamic = "force-dynamic";

// Recado do WhatsApp do cliente, pra tela de dados do contato.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await getSession();
  const features = session ? await getSessionFeatures(session) : [];
  if (!session || !canAccess(features, "whatsapp_suporte")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { customerId } = await params;
  const about = await loadCustomerAbout(customerId).catch(() => null);
  return NextResponse.json({ about });
}
