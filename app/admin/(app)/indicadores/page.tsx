import Link from "next/link";
import { Plus, MessageCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatPhone, whatsappLink } from "@/lib/format";
import { PROFISSAO_LABELS } from "@/lib/constants";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { requireFeature } from "@/lib/session";

export default async function IndicadoresPage() {
  await requireFeature("indicadores");

  const partners = await prisma.partner.findMany({
    orderBy: { cashbackBalance: "desc" },
    include: { _count: { select: { customers: true, sales: true } } },
  });

  const totalSaldo = partners.reduce((sum, p) => sum + p.cashbackBalance, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Indicadores</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            Pedreiros, eletricistas e parceiros que indicam clientes · saldo total {formatCurrency(totalSaldo)}
          </p>
        </div>
        <LinkButton href="/admin/indicadores/novo">
          <Plus className="w-4 h-4" /> Novo indicador
        </LinkButton>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border bg-surface-raised/40">
                <th className="font-medium py-3 px-5">Indicador</th>
                <th className="font-medium py-3 px-4">Profissão</th>
                <th className="font-medium py-3 px-4">Clientes indicados</th>
                <th className="font-medium py-3 px-4">Vendas geradas</th>
                <th className="font-medium py-3 px-4 text-right">Saldo cashback</th>
                <th className="font-medium py-3 px-4 text-right">WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-surface-raised/40">
                  <td className="py-3 px-5">
                    <Link href={`/admin/indicadores/${p.id}`} className="text-ink-primary font-medium hover:text-gold-400">
                      {p.name}
                    </Link>
                    <div className="text-xs text-ink-muted">{formatPhone(p.phone)}</div>
                  </td>
                  <td className="py-3 px-4 text-ink-secondary">{PROFISSAO_LABELS[p.profissao] ?? p.profissao}</td>
                  <td className="py-3 px-4 text-ink-primary tabular-nums">{p._count.customers}</td>
                  <td className="py-3 px-4 text-ink-primary tabular-nums">{p._count.sales}</td>
                  <td className="py-3 px-4 text-right text-gold-400 font-semibold tabular-nums">
                    {formatCurrency(p.cashbackBalance)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <a
                      href={whatsappLink(p.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-status-good hover:bg-status-good/10"
                      title="Abrir WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  </td>
                </tr>
              ))}
              {partners.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-ink-muted">
                    Nenhum indicador cadastrado.
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
