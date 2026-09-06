import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, MessageCircle, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, formatPhone, whatsappLink } from "@/lib/format";
import { PROFISSAO_LABELS } from "@/lib/constants";
import { Card } from "@/components/ui/Card";
import { requireFeature } from "@/lib/session";
import { registerCashbackPayout } from "../actions";

export default async function IndicadorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFeature("indicadores");

  const { id } = await params;

  const partner = await prisma.partner.findUnique({
    where: { id },
    include: {
      customers: { orderBy: { createdAt: "desc" } },
      cashbackTx: { orderBy: { createdAt: "desc" }, take: 20 },
      sales: { orderBy: { date: "desc" }, take: 10, include: { customer: { select: { name: true } } } },
    },
  });

  if (!partner) notFound();

  const payout = registerCashbackPayout.bind(null, partner.id);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">{partner.name}</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {PROFISSAO_LABELS[partner.profissao] ?? partner.profissao} · {formatPhone(partner.phone)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/indicadores/${partner.id}/editar`}
            className="inline-flex items-center gap-2 rounded-lg border border-border-strong text-ink-primary px-4 py-2.5 text-sm font-medium hover:bg-surface-raised transition-colors"
          >
            <Pencil className="w-4 h-4" /> Editar
          </Link>
          <a
            href={whatsappLink(partner.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-status-good text-page px-4 py-2.5 text-sm font-semibold hover:brightness-110 transition-all"
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="text-ink-secondary text-sm mb-1">Saldo de cashback</div>
          <div className="text-2xl font-semibold text-gold-400">{formatCurrency(partner.cashbackBalance)}</div>
        </Card>
        <Card>
          <div className="text-ink-secondary text-sm mb-1">Clientes indicados</div>
          <div className="text-2xl font-semibold text-ink-primary">{partner.customers.length}</div>
        </Card>
        <Card>
          <div className="text-ink-secondary text-sm mb-1">Chave Pix</div>
          <div className="text-lg font-medium text-ink-primary truncate">{partner.pixKey ?? "Não informada"}</div>
        </Card>
      </div>

      <Card title="Registrar pagamento de cashback" subtitle="Marca um valor como pago e desconta do saldo">
        <form action={payout} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label htmlFor="amount" className="block text-xs text-ink-muted mb-1.5">
              Valor pago (R$)
            </label>
            <input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={partner.cashbackBalance || undefined}
              required
              placeholder="0,00"
              className="w-full rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50"
            />
          </div>
          <button
            type="submit"
            disabled={partner.cashbackBalance <= 0}
            className="inline-flex items-center gap-2 rounded-lg bg-gold-400 text-page font-semibold px-5 py-2.5 text-sm hover:bg-gold-300 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <Wallet className="w-4 h-4" /> Registrar pagamento
          </button>
        </form>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Histórico de cashback">
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {partner.cashbackTx.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/60 last:border-0">
                <div>
                  <div className="text-ink-primary">{tx.type === "PAID" ? "Pagamento realizado" : "Cashback de venda"}</div>
                  <div className="text-xs text-ink-muted">{formatDate(tx.createdAt)}</div>
                </div>
                <span className={tx.amount < 0 ? "text-status-critical font-medium" : "text-status-good font-medium"}>
                  {tx.amount < 0 ? "-" : "+"}
                  {formatCurrency(Math.abs(tx.amount))}
                </span>
              </div>
            ))}
            {partner.cashbackTx.length === 0 && <p className="text-sm text-ink-muted">Nenhuma movimentação ainda.</p>}
          </div>
        </Card>

        <Card title="Clientes indicados">
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {partner.customers.map((c) => (
              <Link
                key={c.id}
                href={`/admin/clientes/${c.id}`}
                className="flex items-center justify-between text-sm py-1.5 px-2 -mx-2 rounded-lg hover:bg-surface-raised"
              >
                <span className="text-ink-primary">{c.name}</span>
                <span className="text-xs text-ink-muted">{c.bairro}</span>
              </Link>
            ))}
            {partner.customers.length === 0 && <p className="text-sm text-ink-muted">Nenhum cliente indicado ainda.</p>}
          </div>
        </Card>
      </div>

      <Card title="Vendas que geraram cashback">
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border">
                <th className="font-medium py-2 pr-4">Data</th>
                <th className="font-medium py-2 pr-4">Cliente</th>
                <th className="font-medium py-2 pr-4 text-right">Valor da venda</th>
                <th className="font-medium py-2 text-right">Cashback</th>
              </tr>
            </thead>
            <tbody>
              {partner.sales.map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-4 text-ink-muted tabular-nums">{formatDate(s.date)}</td>
                  <td className="py-2.5 pr-4 text-ink-primary">{s.customer.name}</td>
                  <td className="py-2.5 pr-4 text-right text-ink-primary tabular-nums">{formatCurrency(s.total)}</td>
                  <td className="py-2.5 text-right text-gold-400 tabular-nums">{formatCurrency(s.cashbackAmount)}</td>
                </tr>
              ))}
              {partner.sales.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-ink-muted">
                    Nenhuma venda registrada ainda.
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
