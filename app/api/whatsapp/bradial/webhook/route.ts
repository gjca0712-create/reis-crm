import { NextResponse, type NextRequest } from "next/server";
import { processInboundWhatsAppMessage, normalizeIncomingPhone } from "@/lib/whatsapp/inbound";

// Webhook que o Bradial chama quando o número oficial recebe uma mensagem.
// Ainda não temos o formato exato do payload (docs.bradial.com.br exige login) —
// esta rota tenta os nomes de campo mais comuns entre BSPs (que costumam
// espelhar a Cloud API da Meta) e LOGA o corpo bruto, pra gente ajustar o
// mapeamento assim que o primeiro webhook real chegar.

const WEBHOOK_TOKEN = process.env.BRADIAL_WEBHOOK_SECRET;

function checkToken(request: NextRequest): boolean {
  // Falha FECHADA: sem token configurado, ninguém passa — antes fazia o
  // oposto (liberava geral), o que deixava essa rota aberta pra qualquer um
  // na internet injetar mensagens falsas via processInboundWhatsAppMessage.
  // Como a Reis decidiu não seguir com o Bradial (custo da API oficial a
  // partir de outubro), essa rota fica desativada até/se um token real vier.
  if (!WEBHOOK_TOKEN) return false;
  const token = request.nextUrl.searchParams.get("token") ?? request.headers.get("x-webhook-secret");
  return token === WEBHOOK_TOKEN;
}

// Alguns BSPs fazem uma verificação inicial de URL via GET (challenge), no
// mesmo estilo da Cloud API da Meta — CONFERIR se o Bradial exige isso e, se
// sim, ajustar o nome do parâmetro esperado.
export async function GET(request: NextRequest) {
  if (!checkToken(request)) {
    return NextResponse.json({ error: "token inválido" }, { status: 401 });
  }
  const challenge = request.nextUrl.searchParams.get("challenge") ?? request.nextUrl.searchParams.get("hub.challenge");
  if (challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  if (!checkToken(request)) {
    return NextResponse.json({ error: "token inválido" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  // TEMP: loga o corpo bruto até confirmarmos o formato real com o Bradial.
  // Depois de ver o primeiro payload de verdade, ajustar os campos abaixo e
  // remover este log.
  console.log("[bradial webhook] payload recebido:", JSON.stringify(payload));

  // Tenta os nomes de campo mais prováveis — ajustar aqui assim que soubermos o formato real.
  const rawPhone = payload.from ?? payload.phone ?? payload.contact?.phone ?? payload.sender ?? null;
  const rawText =
    payload.text?.body ??
    payload.message?.text ??
    payload.body ??
    (typeof payload.message === "string" ? payload.message : null);

  const phone = rawPhone ? normalizeIncomingPhone(String(rawPhone)) : null;

  if (phone && rawText) {
    await processInboundWhatsAppMessage(phone, String(rawText));
  }

  return NextResponse.json({ ok: true });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
