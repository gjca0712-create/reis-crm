import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { requireFeature } from "@/lib/session";
import { hasBairro, isPhoneName } from "@/lib/customers/contact";
import { formatPhone } from "@/lib/format";
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
  // Contato do WhatsApp: os campos vêm vazios em vez de "Não informado" e do
  // telefone no lugar do nome — salvando com nome e bairro, vira cliente.
  const defaults = {
    ...customer,
    name: isPhoneName(customer.name, customer.phone) ? "" : customer.name,
    bairro: hasBairro(customer.bairro) ? customer.bairro : "",
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">
          {customer.isContact ? "Completar cadastro" : "Editar cliente"}
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {customer.isContact
            ? `Contato do WhatsApp · ${formatPhone(customer.phone)}. Com nome e bairro, ele passa para a lista de Clientes.`
            : customer.name}
        </p>
      </div>
      <CustomerForm
        action={action}
        partners={partners}
        defaultValues={defaults}
        submitLabel={customer.isContact ? "Salvar e virar cliente" : "Salvar alterações"}
      />
    </div>
  );
}
