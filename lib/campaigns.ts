import { prisma } from "./prisma";
import { recencyBucket } from "./calculations";

export const SEGMENTS = [
  { value: "todos", label: "Todos os clientes" },
  { value: "recencia-30", label: "Compraram nos últimos 30 dias" },
  { value: "recencia-60", label: "Compraram nos últimos 60 dias" },
  { value: "recencia-90", label: "Compraram nos últimos 90 dias" },
  { value: "inativos", label: "Inativos (90+ dias sem comprar)" },
  { value: "sem-compra", label: "Nunca compraram (leads)" },
] as const;

export const SEGMENT_LABELS: Record<string, string> = Object.fromEntries(SEGMENTS.map((s) => [s.value, s.label]));

export type CampaignCustomer = { id: string; name: string; phone: string };

export async function getSegmentCustomers(segmentType: string): Promise<CampaignCustomer[]> {
  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, phone: true, sales: { select: { date: true }, orderBy: { date: "desc" }, take: 1 } },
  });

  if (segmentType === "todos") return customers;

  return customers.filter((c) => {
    const bucket = recencyBucket(c.sales[0]?.date ?? null);
    if (segmentType === "recencia-30") return bucket === "30";
    if (segmentType === "recencia-60") return bucket === "60";
    if (segmentType === "recencia-90") return bucket === "90";
    if (segmentType === "inativos") return bucket === "inativo";
    if (segmentType === "sem-compra") return bucket === "sem-compra";
    return false;
  });
}
