import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

// Lógica compartilhada entre app/api/site/leads (rota pública, exige
// x-api-key — pra integrações externas futuras) e app/api/lead (chamada
// direta pelos formulários do próprio site, mesmo app, sem precisar de key).
export async function createLeadFromSite(input: {
  name: string;
  phone: string;
  email?: string | null;
  message?: string | null;
}) {
  const lead = await prisma.lead.create({
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      message: input.message ?? null,
    },
  });

  revalidatePath("/admin/leads");

  return lead;
}
