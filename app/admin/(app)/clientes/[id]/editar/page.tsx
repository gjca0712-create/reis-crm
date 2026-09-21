import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { requireFeature } from "@/lib/session";
import { updateCustomer } from "../../actions";

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  await requireFeature("clientes");
  const { id } = await params;

  const [customer, partners] = await Promise.all([
    prisma.customer.findUnique({ where: { id } }),
    prisma.partner.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, profissao: true } }),
  ]);

  if (!customer) notFound();

  const action = updateCustomer.bind(null, customer.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Editar cliente</h1>
        <p className="text-sm text-ink-muted mt-0.5">{customer.name}</p>
      </div>
      <CustomerForm action={action} partners={partners} defaultValues={customer} submitLabel="Salvar alterações" />
    </div>
  );
}
