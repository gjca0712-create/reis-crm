import { Wallet, Receipt, ShoppingBag, Percent, MessageCircle } from "lucide-react";
import { formatCurrency, formatDate, whatsappLink } from "@/lib/format";
import { requireFeature } from "@/lib/session";
import { resolvePeriod, periodKeys, storeDayStart } from "@/lib/erp/period";
import {
  getErpDataStatus,
  salesSummary,
  marginSummary,
  revenueSeries,
  paymentMix,
  salesBySeller,
  receivablesOverview,
  payablesOverview,
} from "@/lib/erp/queries";
import { formatPct, formatMoneyCompact, pctDelta, ppDelta } from "@/lib/erp/format";
import { STATUS_COLORS } from "@/lib/chart-colors";
import { StatTile } from "@/components/ui/StatTile";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PeriodTabs } from "@/components/erp/PeriodTabs";
import { ErpDataBanner } from "@/components/erp/ErpDataBanner";
import { ErpRevenueChart } from "@/components/erp/ErpRevenueChart";
import { BarList } from "@/components/erp/BarList";

function PayableLine({
  payable,
  overdue,
}: {
  payable: { fornecedor: string; categoria: string | null; vencimento: Date; saldo: number };
  overdue: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border/60 last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-ink-primary truncate">{payable.fornecedor}</div>
        <div className={`text-xs ${overdue ? "text-status-critical" : "text-ink-muted"}`}>
          {overdue ? "Venceu" : "Vence"} {formatDate(payable.vencimento)}
          {payable.categoria ? ` · ${payable.categoria}` : ""}
        </div>
      </div>
      <span className="text-sm font-medium text-ink-primary tabular-nums shrink-0">{formatCurrency(payable.saldo)}</span>
    </div>
  );
}

// Financeiro da loja, lido do espelho do ERP (lib/erp/queries.ts) — só CEO e
// Gerente (ver MANAGEMENT_FEATURES em lib/permissions.ts).
export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const session = await requireFeature("financeiro");
  const params = await searchParams;
  const period = resolvePeriod(params.periodo);
  const status = await getErpDataStatus();

  const header = (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Financeiro</h1>
        <p className="text-sm text-ink-muted mt-0.5">Faturamento, margem e contas da loja, direto do ERP</p>
      </div>
      {status.mode !== "empty" && <PeriodTabs basePath="/admin/financeiro" current={period.value} />}
    </div>
  );

  if (status.mode === "empty") {
    return (
      <div className="space-y-6">
        {header}
        <ErpDataBanner mode={status.mode} lastSyncAt={status.lastSyncAt} isCeo={session.role === "CEO"} />
      </div>
    );
  }

  const last30 = resolvePeriod("30");
  const [atual, anterior, margem, margemAnterior, serie, formas, vendedores, receber, pagar, ultimos30] = await Promise.all([
    salesSummary(period.start, period.end),
    salesSummary(period.prevStart, period.prevEnd),
    marginSummary(period.start, period.end),
    marginSummary(period.prevStart, period.prevEnd),
    revenueSeries(period),
    paymentMix(period.start, period.end),
    salesBySeller(period.start, period.end),
    receivablesOverview(),
    payablesOverview(),
    salesSummary(last30.start, last30.end),
  ]);

  const chartData = periodKeys(period).map((key) => ({ key, value: serie.get(key) ?? 0 }));
  const totalFormas = formas.reduce((sum, f) => sum + f.total, 0);
  // Início de hoje na loja — vencimento vem gravado como meia-noite da loja.
  const todayStart = storeDayStart(0).getTime();
  const daysLate = (vencimento: Date) => Math.round((todayStart - new Date(vencimento).getTime()) / 86_400_000);

  const aging = [
    { label: "1 a 30 dias", value: receber.aging1, color: STATUS_COLORS.warning },
    { label: "31 a 60 dias", value: receber.aging31, color: STATUS_COLORS.serious },
    { label: "61 a 90 dias", value: receber.aging61, color: STATUS_COLORS.critical },
    { label: "Mais de 90 dias", value: receber.aging90, color: STATUS_COLORS.critical },
  ];

  return (
    <div className="space-y-6">
      {header}
      <ErpDataBanner mode={status.mode} lastSyncAt={status.lastSyncAt} isCeo={session.role === "CEO"} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label={`Faturamento · ${period.label}`}
          value={formatCurrency(atual.receita)}
          icon={Wallet}
          hint={atual.desconto > 0 ? `${formatMoneyCompact(atual.desconto)} em descontos` : undefined}
          {...pctDelta(atual.receita, anterior.receita)}
        />
        <StatTile label="Vendas" value={String(atual.vendas)} icon={ShoppingBag} {...pctDelta(atual.vendas, anterior.vendas)} />
        <StatTile
          label="Ticket médio"
          value={formatCurrency(atual.ticketMedio)}
          icon={Receipt}
          {...pctDelta(atual.ticketMedio, anterior.ticketMedio)}
        />
        <StatTile
          label="Margem bruta"
          value={margem.margemPct != null ? formatPct(margem.margemPct) : "—"}
          icon={Percent}
          hint={
            margem.margemPct == null
              ? "Nenhum produto vendido no período tem custo cadastrado no ERP"
              : margem.coberturaCusto < 90
                ? `Lucro bruto ${formatMoneyCompact(margem.lucroBruto)} · custo conhecido em ${formatPct(margem.coberturaCusto)} das vendas`
                : `Lucro bruto ${formatMoneyCompact(margem.lucroBruto)}`
          }
          {...(margem.margemPct != null && margemAnterior.margemPct != null
            ? ppDelta(margem.margemPct, margemAnterior.margemPct, true)
            : {})}
        />
      </div>

      <Card
        title={period.granularity === "day" ? "Faturamento por dia" : "Faturamento por mês"}
        subtitle={`${period.label} · ${formatCurrency(atual.receita)} no período`}
      >
        <ErpRevenueChart data={chartData} granularity={period.granularity} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Formas de pagamento" subtitle="Quanto entrou por cada forma no período">
          <BarList
            rows={formas.map((f) => ({
              label: f.forma,
              value: f.total,
              display: formatCurrency(f.total),
              detail: totalFormas > 0 ? formatPct((f.total / totalFormas) * 100) : undefined,
            }))}
          />
        </Card>
        <Card title="Vendas por vendedor" subtitle="Faturamento no período">
          <BarList
            rows={vendedores.map((v) => ({
              label: v.vendedor,
              value: v.total,
              display: formatCurrency(v.total),
              detail: `${v.vendas} venda${v.vendas === 1 ? "" : "s"} · ticket ${formatCurrency(v.vendas ? v.total / v.vendas : 0)}`,
            }))}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatTile
          label="A receber nos próximos 30 dias"
          value={formatCurrency(receber.proximos30)}
          hint="Parcelas de crediário/boleto que vencem no período"
        />
        <StatTile
          label="A pagar nos próximos 30 dias"
          value={formatCurrency(pagar.proximos30)}
          hint={
            ultimos30.receita > 0
              ? `Equivale a ${formatPct((pagar.proximos30 / ultimos30.receita) * 100)} do faturamento dos últimos 30 dias`
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card title="Contas a receber" subtitle="Crediário, boleto e cheque" className="lg:col-span-3">
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="rounded-xl bg-surface-raised px-4 py-3">
              <div className="text-xs text-ink-muted">Vence nos próximos 7 dias</div>
              <div className="text-lg font-semibold text-ink-primary tabular-nums">{formatCurrency(receber.semanaTotal)}</div>
              <div className="text-xs text-ink-muted">{receber.semanaQtd} parcela{receber.semanaQtd === 1 ? "" : "s"}</div>
            </div>
            <div className="rounded-xl bg-status-critical/10 border border-status-critical/20 px-4 py-3">
              <div className="text-xs text-status-critical">Em atraso (inadimplência)</div>
              <div className="text-lg font-semibold text-ink-primary tabular-nums">{formatCurrency(receber.vencidoTotal)}</div>
              <div className="text-xs text-ink-muted">{receber.vencidoQtd} parcela{receber.vencidoQtd === 1 ? "" : "s"}</div>
            </div>
          </div>

          <h4 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-3">Atraso por faixa</h4>
          <BarList
            rows={aging.map((a) => ({ label: a.label, value: a.value, display: formatCurrency(a.value), color: a.color }))}
            empty="Nenhuma parcela em atraso."
          />

          <h4 className="text-xs font-medium text-ink-muted uppercase tracking-wide mt-6 mb-2">Quem está devendo</h4>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-muted border-b border-border">
                  <th className="font-medium py-2 pr-4">Cliente</th>
                  <th className="font-medium py-2 pr-4 text-right">Parcelas</th>
                  <th className="font-medium py-2 pr-4 text-right">Atraso</th>
                  <th className="font-medium py-2 pr-4 text-right">Em aberto</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {receber.devedores.map((d, i) => {
                  const dias = daysLate(d.vencimentoMaisAntigo);
                  return (
                    <tr key={`${i}-${d.clienteNome}`} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-4 text-ink-primary">{d.clienteNome}</td>
                      <td className="py-2.5 pr-4 text-right text-ink-secondary tabular-nums">{d.parcelas}</td>
                      <td className="py-2.5 pr-4 text-right">
                        <Badge status={dias > 60 ? "critical" : dias > 30 ? "serious" : "warning"}>
                          {dias} dia{dias === 1 ? "" : "s"}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-ink-primary font-medium tabular-nums">
                        {formatCurrency(d.saldo)}
                      </td>
                      <td className="py-2.5 text-right">
                        {d.clienteTelefone && status.mode === "live" ? (
                          <a
                            href={whatsappLink(
                              d.clienteTelefone,
                              `Olá, ${d.clienteNome.split(" ")[0]}! Aqui é da Reis Materiais de Construção. Passando pra lembrar de uma parcela em aberto com a gente. Qualquer dúvida, estamos à disposição!`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-gold-400 hover:text-gold-300"
                          >
                            <MessageCircle className="w-3.5 h-3.5" /> Cobrar
                          </a>
                        ) : status.mode === "demo" ? (
                          // Na demonstração não há telefone (cliente fictício) — mostra o botão
                          // só pra ilustrar, sem abrir nada.
                          <span
                            className="inline-flex items-center gap-1 text-xs text-ink-muted cursor-not-allowed"
                            title="Com o ERP conectado, abre o WhatsApp do cliente com a mensagem de cobrança pronta"
                          >
                            <MessageCircle className="w-3.5 h-3.5" /> Cobrar
                          </span>
                        ) : (
                          <span className="text-xs text-ink-muted" title="Sem telefone cadastrado no ERP">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {receber.devedores.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-ink-muted">
                      Ninguém em atraso.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Contas a pagar" subtitle="Fornecedores e despesas" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="rounded-xl bg-status-critical/10 border border-status-critical/20 px-4 py-3">
              <div className="text-xs text-status-critical">Vencidas</div>
              <div className="text-lg font-semibold text-ink-primary tabular-nums">{formatCurrency(pagar.vencidoTotal)}</div>
              <div className="text-xs text-ink-muted">{pagar.vencidoQtd} conta{pagar.vencidoQtd === 1 ? "" : "s"}</div>
            </div>
            <div className="rounded-xl bg-surface-raised px-4 py-3">
              <div className="text-xs text-ink-muted">Próximos 7 dias</div>
              <div className="text-lg font-semibold text-ink-primary tabular-nums">{formatCurrency(pagar.semanaTotal)}</div>
              <div className="text-xs text-ink-muted">
                {pagar.hojeTotal > 0 ? `${formatCurrency(pagar.hojeTotal)} vence hoje` : `${pagar.semanaQtd} conta${pagar.semanaQtd === 1 ? "" : "s"}`}
              </div>
            </div>
          </div>

          {pagar.vencidas.length > 0 && (
            <>
              <h4 className="text-xs font-medium text-status-critical uppercase tracking-wide mb-1">Vencidas</h4>
              <div className="space-y-1 mb-4">
                {pagar.vencidas.map((p) => (
                  <PayableLine key={p.id} payable={p} overdue />
                ))}
                {pagar.vencidoQtd > pagar.vencidas.length && (
                  <p className="text-xs text-ink-muted pt-1">
                    Mostrando as {pagar.vencidas.length} mais recentes de {pagar.vencidoQtd} contas vencidas.
                  </p>
                )}
              </div>
            </>
          )}

          <h4 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">Próximas</h4>
          <div className="space-y-1">
            {pagar.proximas.map((p) => (
              <PayableLine key={p.id} payable={p} overdue={false} />
            ))}
            {pagar.proximas.length === 0 && <p className="text-sm text-ink-muted">Nenhuma conta a pagar nos próximos 30 dias.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
