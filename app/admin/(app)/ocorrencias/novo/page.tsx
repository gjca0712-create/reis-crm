import { prisma } from "@/lib/prisma";
import { OccurrenceForm } from "@/components/occurrences/OccurrenceForm";
import { requireFeature } from "@/lib/session";
import { createOccurrence } from "../actions";

export default async function NovaOcorrenciaPage({ searchParams }: { searchParams: Promise<{ clienteId?: string }> }) {
  await requireFeature("ocorrencias");

  const params = await searchParams;

  const [customers, sales] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.sale.findMany({
      orderBy: { date: "desc" },
      take: 150,
      select: { id: true, date: true, total: true, customer: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Registrar ocorrência</h1>
        <p className="text-sm text-ink-muted mt-0.5">Erros de estoque, separação, entrega e outros problemas operacionais</p>
      </div>
      <OccurrenceForm action={createOccurrence} customers={customers} sales={sales} defaultCustomerId={params.clienteId} />
    </div>
  );
}
