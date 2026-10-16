import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supportVersion } from "@/lib/whatsapp/live";

export const dynamic = "force-dynamic";

// "Mudou alguma coisa no Suporte?" — a tela pergunta a cada 2 s (LiveRefresh)
// e só recarrega quando muda. Só confere o login (sem ir no banco): é chamada
// o tempo todo e devolve só um número, nenhum dado de cliente.
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json({ v: supportVersion() }, { headers: { "Cache-Control": "no-store" } });
}
