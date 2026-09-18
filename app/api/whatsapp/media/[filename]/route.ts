import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { readMediaFile, MIME_BY_EXT } from "@/lib/whatsapp/media";

// Serve os anexos de WhatsApp guardados no volume. Exige login (mesma sessão do
// painel) — sem isso, qualquer um que adivinhasse o nome do arquivo veria fotos
// de conversa de cliente.
export async function GET(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const session = await getSession();
  if (!session) {
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
