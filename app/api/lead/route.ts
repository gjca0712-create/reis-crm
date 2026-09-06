import { NextResponse } from "next/server";
import { createLeadFromSite } from "@/lib/leads";

// Chamada pelos formulários do site (ContatoForm, orçamento). Antes repassava
// por HTTP pra um serviço CRM separado (Multi-Zones); agora é o mesmo app,
// então cria o Lead direto — sem key, porque essa rota só é alcançável pelo
// próprio front-end do site, na mesma origem.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const email = typeof body?.email === "string" && body.email.trim() ? body.email.trim() : undefined;
  const message = typeof body?.message === "string" && body.message.trim() ? body.message.trim() : undefined;

  if (!name || !phone) {
    return NextResponse.json({ error: "name e phone são obrigatórios" }, { status: 400 });
  }

  try {
    const lead = await createLeadFromSite({ name, phone, email, message });
    return NextResponse.json({ id: lead.id }, { status: 201 });
  } catch (err) {
    console.error("Erro ao criar lead:", err);
    return NextResponse.json({ error: "Falha ao registrar contato" }, { status: 500 });
  }
}
