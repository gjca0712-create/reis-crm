import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PartnerForm } from "@/components/partners/PartnerForm";
import { updatePartner } from "../../actions";

export default async function EditarIndicadorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id } });
  if (!partner) notFound();

  const action = updatePartner.bind(null, partner.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Editar indicador</h1>
        <p className="text-sm text-ink-muted mt-0.5">{partner.name}</p>
      </div>
      <PartnerForm action={action} defaultValues={partner} submitLabel="Salvar alterações" />
    </div>
  );
}
