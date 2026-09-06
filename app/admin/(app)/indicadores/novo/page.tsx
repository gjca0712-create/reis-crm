import { PartnerForm } from "@/components/partners/PartnerForm";
import { requireFeature } from "@/lib/session";
import { createPartner } from "../actions";

export default async function NovoIndicadorPage() {
  await requireFeature("indicadores");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Novo indicador</h1>
        <p className="text-sm text-ink-muted mt-0.5">Pedreiro, eletricista ou outro parceiro que indica clientes</p>
      </div>
      <PartnerForm action={createPartner} />
    </div>
  );
}
