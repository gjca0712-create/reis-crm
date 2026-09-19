import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { canAccess } from "@/lib/permissions";
import { readMediaFile, MIME_BY_EXT } from "@/lib/whatsapp/media";

// Serve os anexos de WhatsApp guardados no volume. Exige a mesma permissão
// whatsapp_suporte das outras telas/actions do atendimento — só checar login
// (getSession) deixava um VENDEDOR, que não tem acesso à tela de Suporte,
// abrir foto/áudio de cliente se descobrisse a URL de um anexo.
export async function GET(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const session = await getSession();
  if (!session || !canAccess(session.role, "whatsapp_suporte")) {
    return new NextResponse("Não autorizado", { status: 401 });
  }

  const { filename } = await params;

  try {
    const buffer = await readMediaFile(filename);
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Arquivo não encontrado", { status: 404 });
  }
}
