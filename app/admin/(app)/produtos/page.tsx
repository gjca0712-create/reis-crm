import { Boxes, Package, PackageX, Clock } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireFeature } from "@/lib/session";
import { resolvePeriod } from "@/lib/erp/period";
import {
  getErpDataStatus,
  productSales,
  revenueByGroup,
  stockOverview,
  stockouts,
  deadStock,
  type ProductRanking,
  type ProductOrder,
} from "@/lib/erp/queries";
import { formatPct, formatMoneyCompact, formatQty } from "@/lib/erp/format";
import { StatTile } from "@/components/ui/StatTile";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PeriodTabs } from "@/components/erp/PeriodTabs";
import { ErpDataBanner } from "@/components/erp/ErpDataBanner";
import { BarList } from "@/components/erp/BarList";

const RANKING_SIZE = 15;

const ORDERS: { value: ProductOrder; label: string }[] = [
  { value: "receita", label: "Faturamento" },
  { value: "quantidade", label: "Quantidade" },
  { value: "margem", label: "Lucro" },
];

function sortRanking(rows: ProductRanking[], order: ProductOrder) {
  const sorted = [...rows];
  if (order === "quantidade") sorted.sort((a, b) => b.quantidade - a.quantidade);
  // Sem custo não tem lucro calculável — vai pro fim em vez de parecer lucro zero.
  else if (order === "margem") sorted.sort((a, b) => (b.lucro ?? -Infinity) - (a.lucro ?? -Infinity));
  return sorted.slice(0, RANKING_SIZE);
}

// Curva ABC por faturamento: A = produtos que somam os primeiros 80% do
// faturamento, B = até 95%, C = o resto. `rows` já vem ordenado por receita.
function abcCurve(rows: ProductRanking[]) {
  const total = rows.reduce((sum, r) => sum + r.receita, 0);
  const classes = { A: { produtos: 0, receita: 0 }, B: { produtos: 0, receita: 0 }, C: { produtos: 0, receita: 0 } };
  let acumulado = 0;
  for (const r of rows) {
    // Classifica pelo acumulado ANTES do produto: o que cruza a linha dos 80% ainda é A.
    const share = total > 0 ? acumulado / total : 1;
    const cls = share < 0.8 ? "A" : share < 0.95 ? "B" : "C";
    classes[cls].produtos += 1;
    classes[cls].receita += r.receita;
    acumulado += r.receita;
  }
  return { total, produtos: rows.length, classes };
}

function stockBadge(estoque: number | null, unidade: string | null) {
  if (estoque == null) return <span className="text-ink-muted">—</span>;
  if (estoque <= 0) return <Badge status="critical">{formatQty(estoque, unidade)}</Badge>;
  return <span className="text-ink-secondary tabular-nums">{formatQty(estoque, unidade)}</span>;
}

// Produtos da loja, lidos do espelho do ERP — só CEO e Gerente.
export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; ordem?: string }>;
}) {
  const session = await requireFeature("produtos");
  const params = await searchParams;
  const period = resolvePeriod(params.periodo);
  const order: ProductOrder = ORDERS.some((o) => o.value === params.ordem) ? (params.ordem as ProductOrder) : "receita";
  const status = await getErpDataStatus();

  const header = (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Produtos</h1>
        <p className="text-sm text-ink-muted mt-0.5">Mais vendidos, margem, estoque parado e em falta, direto do ERP</p>
      </div>
      {status.mode !== "empty" && (
        <PeriodTabs basePath="/admin/produtos" current={period.value} extraParams={{ ordem: order }} />
      )}
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

  const [estoque, vendidos, grupos, ruptura, parados] = await Promise.all([
    stockOverview(),
    productSales(period.start, period.end),
    revenueByGroup(period.start, period.end),
    stockouts(500),
    deadStock(10),
  ]);

  const ranking = sortRanking(vendidos, order);
  const abc = abcCurve(vendidos);
  const totalGrupos = grupos.reduce((sum, g) => sum + g.receita, 0);

  const abcRows = (["A", "B", "C"] as const).map((cls) => {
    const c = abc.classes[cls];
    return {
      cls,
      ...c,
      pctProdutos: abc.produtos > 0 ? (c.produtos / abc.produtos) * 100 : 0,
      pctReceita: abc.total > 0 ? (c.receita / abc.total) * 100 : 0,
    };
  });
  const ABC_HINT = {
    A: "Carro-chefe: nunca pode faltar",
    B: "Importantes, reposição regular",
    C: "Cauda longa: vende pouco, avaliar mix",
  } as const;

  return (
    <div className="space-y-6">
      {header}
      <ErpDataBanner mode={status.mode} lastSyncAt={status.lastSyncAt} isCeo={session.role === "CEO"} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Valor em estoque (custo)"
          value={formatCurrency(estoque.valorCusto)}
          icon={Boxes}
          hint={`${formatMoneyCompact(estoque.valorVenda)} a preço de venda`}
        />
        <StatTile
          label="Produtos ativos"
          value={String(estoque.ativos)}
          icon={Package}
          hint={
            estoque.semCusto > 0
              ? `${estoque.semCusto} sem custo cadastrado${estoque.negativos > 0 ? ` · ${estoque.negativos} com estoque negativo` : ""}`
              : estoque.negativos > 0
                ? `${estoque.negativos} com estoque negativo`
                : undefined
          }
        />
        <StatTile
          label="Em falta (vende e zerou)"
          value={String(ruptura.length)}
          icon={PackageX}
          hint="Produtos com venda nos últimos 30 dias e estoque zerado"
          className={ruptura.length > 0 ? "border-status-critical/40" : undefined}
        />
        <StatTile
          label={`Parados há ${parados.dias}+ dias`}
          value={parados.historicoSuficiente ? String(parados.total) : "—"}
          icon={Clock}
          hint={
            parados.historicoSuficiente
              ? `${formatMoneyCompact(parados.valorTotal)} em mercadoria parada (custo)`
              : `Precisa de ${parados.dias} dias de vendas no sistema (hoje: ${parados.historicoDias})`
          }
        />
      </div>

      <Card
        title={`Mais vendidos · ${period.label}`}
        subtitle={`${vendidos.length} produtos vendidos no período · top ${RANKING_SIZE}`}
        action={
          <div className="flex gap-1 bg-surface-raised rounded-lg p-1">
            {ORDERS.map((o) => (
              <a
                key={o.value}
                href={`/admin/produtos?${new URLSearchParams({ periodo: period.value, ordem: o.value }).toString()}`}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  order === o.value ? "bg-gold-400 text-page" : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                {o.label}
              </a>
            ))}
          </div>
        }
      >
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border">
                <th className="font-medium py-2 pr-3 w-8">#</th>
                <th className="font-medium py-2 pr-4">Produto</th>
                <th className="font-medium py-2 pr-4 text-right">Quantidade</th>
                <th className="font-medium py-2 pr-4 text-right">Faturamento</th>
                <th className="font-medium py-2 pr-4 text-right">Lucro bruto</th>
                <th className="font-medium py-2 pr-4 text-right">Margem</th>
                <th className="font-medium py-2 text-right">Estoque</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((p, i) => (
                <tr key={p.codigo} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-3 text-ink-muted tabular-nums">{i + 1}</td>
                  <td className="py-2.5 pr-4">
                    <div className="text-ink-primary">{p.descricao}</div>
                    <div className="text-xs text-ink-muted">
                      Cód. {p.codigo}
                      {p.grupo ? ` · ${p.grupo}` : ""}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-ink-secondary tabular-nums whitespace-nowrap">
                    {formatQty(p.quantidade, p.unidade)}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-ink-primary font-medium tabular-nums whitespace-nowrap">
                    {formatCurrency(p.receita)}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-ink-secondary tabular-nums whitespace-nowrap">
                    {p.lucro != null ? formatCurrency(p.lucro) : <span className="text-ink-muted" title="Sem custo cadastrado no ERP">sem custo</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums whitespace-nowrap">
                    {p.margemPct != null ? (
                      <span className={p.margemPct < 10 ? "text-status-critical" : "text-ink-secondary"}>
                        {formatPct(p.margemPct)}
                      </span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right whitespace-nowrap">{stockBadge(p.estoque, p.unidade)}</td>
                </tr>
              ))}
              {ranking.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-ink-muted">
                    Nenhuma venda no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Curva ABC" subtitle="Quantos produtos fazem o faturamento da loja">
          <div className="space-y-3">
            {abcRows.map((r) => (
              <div key={r.cls} className="flex items-center gap-4 rounded-xl bg-surface-raised px-4 py-3">
                <span className="w-9 h-9 rounded-lg bg-gold-400/10 text-gold-400 font-semibold flex items-center justify-center shrink-0">
                  {r.cls}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-primary">
                    {r.produtos} produto{r.produtos === 1 ? "" : "s"}{" "}
                    <span className="text-ink-muted">({formatPct(r.pctProdutos)} do mix)</span>
                  </div>
                  <div className="text-xs text-ink-muted">{ABC_HINT[r.cls]}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-medium text-ink-primary tabular-nums">{formatPct(r.pctReceita)}</div>
                  <div className="text-xs text-ink-muted tabular-nums">{formatMoneyCompact(r.receita)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Faturamento por grupo" subtitle={period.label}>
          <BarList
            rows={grupos.slice(0, 10).map((g) => ({
              label: g.grupo,
              value: g.receita,
              display: formatCurrency(g.receita),
              detail: totalGrupos > 0 ? formatPct((g.receita / totalGrupos) * 100) : undefined,
            }))}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Em falta" subtitle="Vendeu nos últimos 30 dias e o estoque zerou — venda perdida">
          <div className="space-y-1">
            {ruptura.slice(0, 10).map((p) => (
              <div key={p.codigo} className="flex items-center justify-between gap-3 py-2 border-b border-border/60 last:border-0">
                <div className="min-w-0">
                  <div className="text-sm text-ink-primary truncate">{p.descricao}</div>
                  <div className="text-xs text-ink-muted">
                    Vendeu {formatQty(p.vendido30, p.unidade)} ({formatMoneyCompact(p.receita30)}) em 30 dias
                  </div>
                </div>
                <Badge status="critical">{formatQty(p.estoque, p.unidade)}</Badge>
              </div>
            ))}
            {ruptura.length === 0 && <p className="text-sm text-ink-muted">Nenhum produto em falta.</p>}
            {ruptura.length > 10 && (
              <p className="text-xs text-ink-muted pt-2">
                Mostrando os 10 que mais vendiam, de {ruptura.length} produtos em falta.
              </p>
            )}
          </div>
        </Card>

        <Card
          title="Parados"
          subtitle={`Tem estoque e não vende há mais de ${parados.dias} dias — dinheiro parado na prateleira`}
        >
          {!parados.historicoSuficiente ? (
            <p className="text-sm text-ink-muted">
              O sistema ainda tem só {parados.historicoDias} dia{parados.historicoDias === 1 ? "" : "s"} de vendas do
              ERP. Com menos de {parados.dias} dias não dá pra saber o que está parado — essa lista aparece sozinha
              quando o histórico completar.
            </p>
          ) : (
            <div className="space-y-1">
              {parados.itens.map((p) => (
                <div
                  key={p.codigo}
                  className="flex items-center justify-between gap-3 py-2 border-b border-border/60 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-ink-primary truncate">{p.descricao}</div>
                    <div className="text-xs text-ink-muted">
                      {formatQty(p.estoque, p.unidade)} em estoque ·{" "}
                      {p.ultimaVenda ? `última venda ${formatDate(p.ultimaVenda)}` : "nunca vendeu"}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-ink-primary tabular-nums shrink-0">
                    {p.valorParado != null ? formatCurrency(p.valorParado) : "sem custo"}
                  </span>
                </div>
              ))}
              {parados.itens.length === 0 && <p className="text-sm text-ink-muted">Nenhum produto parado.</p>}
              {parados.total > parados.itens.length && (
                <p className="text-xs text-ink-muted pt-2">
                  Mostrando os {parados.itens.length} de maior valor de {parados.total} produtos parados.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
