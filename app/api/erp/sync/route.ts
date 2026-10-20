import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { applySyncPayload, syncPayloadSchema } from "@/lib/erp/sync";
import { pendingSyncRequest } from "@/lib/erp/sync-request";

// Recebe os dados do ERP (Órbita) enviados pelo programa de sincronização que
// roda no computador da loja — ver o contrato em lib/erp/sync.ts. Só servidor
// com servidor: sem CORS, e com chave PRÓPRIA (ERP_SYNC_KEY), nunca a
// SITE_API_KEY (essa fica visível no HTML do site).
//
// Header: Authorization: Bearer <ERP_SYNC_KEY>

// Compara por hash (tamanho fixo) com timingSafeEqual — não dá pra descobrir a
// chave medindo quanto tempo a resposta demora.
function isAuthorized(request: Request): boolean {
  const expected = process.env.ERP_SYNC_KEY;
  if (!expected || expected.length < 32) return false; // sem chave (ou chave fraca) = endpoint fechado
  const header = request.headers.get("authorization") ?? "";
  const received = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export const dynamic = "force-dynamic";

// O programa pergunta a cada minuto: alguém apertou "Atualizar agora"?
// Devolve a hora do pedido (o programa manda de volta no fim da rodada, em
// handledRequestAt) ou null.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const requestedAt = await pendingSyncRequest();
  return NextResponse.json(
    { requestedAt: requestedAt?.toISOString() ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = syncPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Formato inválido.", issues: parsed.error.issues.slice(0, 20) },
      { status: 400 }
    );
  }

  try {
    const result = await applySyncPayload(parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Falha ao gravar sincronização do ERP:", err);
    return NextResponse.json({ error: "Falha ao gravar os dados." }, { status: 500 });
  }
}
