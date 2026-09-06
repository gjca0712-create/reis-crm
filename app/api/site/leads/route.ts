import { NextResponse } from "next/server";
import { verifyApiKey, CORS_HEADERS } from "@/lib/apiAuth";
import { createLeadFromSite } from "@/lib/leads";

// Rota pública (exige x-api-key) — hoje sem uso interno (o próprio site chama
// app/api/lead, que roda no mesmo app), mantida pra qualquer integração
// externa futura que precise criar um Lead sem fazer parte deste projeto.
export async function POST(request: Request) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : null;
  const message = typeof body?.message === "string" ? body.message.trim() : null;

  if (!name || !phone) {
    return NextResponse.json({ error: "name e phone são obrigatórios" }, { status: 400, headers: CORS_HEADERS });
  }

  const lead = await createLeadFromSite({ name, phone, email, message });

  return NextResponse.json({ id: lead.id }, { status: 201, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
