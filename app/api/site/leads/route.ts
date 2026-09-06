import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifyApiKey, CORS_HEADERS } from "@/lib/apiAuth";

// Recebe pedidos de orçamento do site (formulário público) e cria um Lead
// pra equipe de vendas dar seguimento na aba Leads do CRM.
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

  const lead = await prisma.lead.create({ data: { name, phone, email, message } });

  revalidatePath("/leads");

  return NextResponse.json({ id: lead.id }, { status: 201, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
