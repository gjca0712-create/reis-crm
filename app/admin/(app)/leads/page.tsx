import Link from "next/link";
import { UserCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatPhone, whatsappLink } from "@/lib/format";
import { LEAD_STATUS_LABELS, BAIRROS_PADRAO, type LeadStatus } from "@/lib/constants";
import { LEAD_STATUS_BADGE } from "@/lib/calculations";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { requireFeature } from "@/lib/session";
import { markLeadStatus, convertLead } from "./actions";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireFeature("leads");

  const params = await searchParams;
  const statusFilter = (params.status ?? "") as LeadStatus | "";

  const leads = await prisma.lead.findMany({
    where: statusFilter ? { status: statusFilter } : {},
    orderBy: { createdAt: "desc" },
    include: { convertedCustomer: { select: { id: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Leads (site)</h1>
        <p className="text-sm text-ink-muted mt-0.5">Pedidos de orçamento capturados no site — {leads.length} nesse filtro</p>
      </div>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <label htmlFor="status" className="block text-xs text-ink-muted mb-1.5">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={statusFilter}
              className="w-full rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-gold-400/50"
            >
              <option value="">Todos</option>
              {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-gold-400 text-page font-medium text-sm px-5 py-2.5 hover:bg-gold-300 transition-colors"
          >
            Filtrar
          </button>
          {statusFilter && (
            <Link href="/admin/leads" className="text-sm text-ink-muted hover:text-ink-primary px-2 py-2.5">
              Limpar
            </Link>
          )}
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border bg-surface-raised/40">
                <th className="font-medium py-3 px-5">Recebido em</th>
                <th className="font-medium py-3 px-4">Nome</th>
                <th className="font-medium py-3 px-4">Contato</th>
                <th className="font-medium py-3 px-4">Mensagem</th>
                <th className="font-medium py-3 px-4">Status</th>
                <th className="font-medium py-3 px-4">Ações</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-border/60 last:border-0 hover:bg-surface-raised/40">
                  <td className="py-3 px-5 text-ink-muted tabular-nums whitespace-nowrap">{formatDateTime(lead.createdAt)}</td>
                  <td className="py-3 px-4 text-ink-primary font-medium">{lead.name}</td>
                  <td className="py-3 px-4 text-ink-secondary">
                    <div>{formatPhone(lead.phone)}</div>
                    {lead.email && <div className="text-xs text-ink-muted">{lead.email}</div>}
                  </td>
                  <td className="py-3 px-4 text-ink-secondary max-w-xs truncate" title={lead.message ?? undefined}>
                    {lead.message ?? "—"}
                  </td>
                  <td className="py-3 px-4">
                    <Badge status={LEAD_STATUS_BADGE[lead.status] ?? "neutral"}>{LEAD_STATUS_LABELS[lead.status] ?? lead.status}</Badge>
                  </td>
                  <td className="py-3 px-4">
                    {lead.status === "CONVERTIDO" && lead.convertedCustomer ? (
                      <Link href={`/admin/clientes/${lead.convertedCustomer.id}`} className="text-xs text-gold-400 hover:text-gold-300">
                        Ver cliente
                      </Link>
                    ) : lead.status === "PERDIDO" ? (
                      <span className="text-xs text-ink-muted">—</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={whatsappLink(lead.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-status-good hover:underline"
                        >
                          WhatsApp
                        </a>
                        {lead.status === "NOVO" && (
                          <form action={markLeadStatus.bind(null, lead.id, "CONTATADO")}>
                            <button type="submit" className="text-xs text-gold-400 hover:text-gold-300">
                              Marcar contatado
                            </button>
                          </form>
                        )}
                        <form action={convertLead.bind(null, lead.id)} className="flex items-center gap-1.5">
                          <select
                            name="bairro"
                            required
                            defaultValue=""
                            className="rounded-lg bg-page border border-border px-2 py-1.5 text-xs text-ink-secondary focus:outline-none focus:ring-2 focus:ring-gold-400/50"
                          >
                            <option value="" disabled>
                              Bairro
                            </option>
                            {BAIRROS_PADRAO.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 text-xs text-status-good hover:underline whitespace-nowrap"
                          >
                            <UserCheck className="w-3.5 h-3.5" /> Converter
                          </button>
                        </form>
                        <form action={markLeadStatus.bind(null, lead.id, "PERDIDO")}>
                          <button type="submit" className="text-xs text-status-critical hover:underline">
                            Perdido
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-ink-muted">
                    Nenhum lead recebido do site ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
