import { prisma } from "@/lib/prisma";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { createCustomer } from "../actions";

export default async function NovoClientePage() {
  const partners = await prisma.partner.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, profissao: true },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Novo cliente</h1>
        <p className="text-sm text-ink-muted mt-0.5">Cadastre os dados do cliente</p>
      </div>
      <CustomerForm action={createCustomer} partners={partners} />
    </div>
  );
}
