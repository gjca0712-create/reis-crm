import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STORE_TIMEZONE, storeDayStart, type ErpPeriod } from "./period";

// Consultas das telas Financeiro/Produtos em cima do espelho do ERP (models
// Erp* em prisma/schema.prisma). Agregação no próprio Postgres (SQL), não em
// JS: com o histórico real do ERP são centenas de milhares de itens.
// Toda soma sai com ::float e toda contagem com ::int — senão o $queryRaw
// devolve Decimal/BigInt, que não serializam pra componentes client.
//
// "Venda válida" aqui é só `cancelada = false`: quem decide o que é venda de
// verdade no Órbita (autorizada, não orçamento/DAV) é o programa de
// sincronização, que só manda essas.

const VALID_SALE = Prisma.sql`s.cancelada = false`;

// As colunas de data são `timestamp` SEM fuso, gravadas em UTC pelo Prisma. Já
// um Date passado no $queryRaw chega como `timestamptz` — e comparar os dois faz
// o Postgres converter a coluna pelo fuso DA SESSÃO (no banco local é
// America/Bahia): a janela inteira andaria 3h. Converter o parâmetro pra UTC sem
// fuso deixa a comparação igual em qualquer banco.
function at(date: Date) {
  return Prisma.sql`(${date}::timestamptz AT TIME ZONE 'UTC')`;
}

function inRange(start: Date, end: Date) {
  return Prisma.sql`s.data >= ${at(start)} AND s.data < ${at(end)}`;
}

// Converte o timestamp gravado (UTC, sem fuso) pro horário da loja antes de
// agrupar por dia/mês.
const LOCAL_DATA = Prisma.sql`(s.data AT TIME ZONE 'UTC' AT TIME ZONE ${STORE_TIMEZONE})`;

// ---------------------------------------------------------------------------
// Estado dos dados: vazio (nunca sincronizou), demonstração, ou ERP de verdade.
// ---------------------------------------------------------------------------

export type ErpDataMode = "empty" | "demo" | "live";

// "live" assim que o ERP real começou a mandar QUALQUER coisa (a sincronização
// cria o ErpSyncState antes de gravar) — mesmo que o primeiro lote tenha sido só
// de contas a receber/pagar.
export async function getErpDataStatus(): Promise<{ mode: ErpDataMode; lastSyncAt: Date | null }> {
  const [state, demoSale, demoProduct, realSale, realProduct, realReceivable, realPayable] = await Promise.all([
    prisma.erpSyncState.findUnique({ where: { id: "erp" } }),
    prisma.erpSale.findFirst({ where: { demo: true }, select: { id: true } }),
    prisma.erpProduct.findFirst({ where: { demo: true }, select: { id: true } }),
    prisma.erpSale.findFirst({ where: { demo: false }, select: { id: true } }),
    prisma.erpProduct.findFirst({ where: { demo: false }, select: { id: true } }),
    prisma.erpReceivable.findFirst({ where: { demo: false }, select: { id: true } }),
    prisma.erpPayable.findFirst({ where: { demo: false }, select: { id: true } }),
  ]);
  const live = state || realSale || realProduct || realReceivable || realPayable;
  const mode: ErpDataMode = live ? "live" : demoSale || demoProduct ? "demo" : "empty";
  return { mode, lastSyncAt: state?.lastSyncAt ?? null };
}

// ---------------------------------------------------------------------------
// Vendas
// ---------------------------------------------------------------------------

export async function salesSummary(start: Date, end: Date) {
  const [row] = await prisma.$queryRaw<{ vendas: number; receita: number; desconto: number }[]>`
    SELECT COUNT(*)::int AS vendas,
           COALESCE(SUM(s.total), 0)::float AS receita,
           COALESCE(SUM(s.desconto), 0)::float AS desconto
    FROM "ErpSale" s
    WHERE ${VALID_SALE} AND ${inRange(start, end)}`;
  return {
    vendas: row.vendas,
    receita: row.receita,
    desconto: row.desconto,
    ticketMedio: row.vendas > 0 ? row.receita / row.vendas : 0,
  };
}

// Margem bruta só sobre itens COM custo — item sem custo cadastrado entraria
// como 100% de margem e inflaria o número. `coberturaCusto` diz quanto do
// faturamento de itens tem custo conhecido (pra tela avisar quando for baixo).
// Custo 0 conta como "sem custo" (a sincronização já grava null, isso é defesa).
// margemPct null = nenhum item do período tem custo (não dá pra calcular).
export async function marginSummary(start: Date, end: Date) {
  const [row] = await prisma.$queryRaw<{ receitaItens: number; receitaComCusto: number; custo: number }[]>`
    SELECT COALESCE(SUM(i."valorTotal"), 0)::float AS "receitaItens",
           COALESCE(SUM(CASE WHEN i."custoUnitario" > 0 THEN i."valorTotal" END), 0)::float AS "receitaComCusto",
           COALESCE(SUM(CASE WHEN i."custoUnitario" > 0 THEN i.quantidade * i."custoUnitario" END), 0)::float AS custo
    FROM "ErpSaleItem" i
    JOIN "ErpSale" s ON s.id = i."saleId"
    WHERE ${VALID_SALE} AND ${inRange(start, end)}`;
  const lucro = row.receitaComCusto - row.custo;
  return {
    lucroBruto: lucro,
    margemPct: row.receitaComCusto > 0 ? (lucro / row.receitaComCusto) * 100 : null,
    coberturaCusto: row.receitaItens > 0 ? (row.receitaComCusto / row.receitaItens) * 100 : 0,
  };
}

// Faturamento por dia ou por mês (horário da loja). Chave "YYYY-MM-DD"/"YYYY-MM".
export async function revenueSeries(period: ErpPeriod): Promise<Map<string, number>> {
  const format = period.granularity === "day" ? "YYYY-MM-DD" : "YYYY-MM";
  const rows = await prisma.$queryRaw<{ k: string; v: number }[]>`
    SELECT to_char(${LOCAL_DATA}, ${format}) AS k, SUM(s.total)::float AS v
    FROM "ErpSale" s
    WHERE ${VALID_SALE} AND ${inRange(period.start, period.end)}
    GROUP BY 1`;
  return new Map(rows.map((r) => [r.k, r.v]));
}

export async function paymentMix(start: Date, end: Date) {
  return prisma.$queryRaw<{ forma: string; total: number; vendas: number }[]>`
    SELECT p.forma, SUM(p.valor)::float AS total, COUNT(DISTINCT p."saleId")::int AS vendas
    FROM "ErpSalePayment" p
    JOIN "ErpSale" s ON s.id = p."saleId"
    WHERE ${VALID_SALE} AND ${inRange(start, end)}
    GROUP BY p.forma
    ORDER BY total DESC`;
}

export async function salesBySeller(start: Date, end: Date) {
  return prisma.$queryRaw<{ vendedor: string; vendas: number; total: number }[]>`
    SELECT COALESCE(NULLIF(TRIM(s.vendedor), ''), 'Sem vendedor') AS vendedor,
           COUNT(*)::int AS vendas,
           SUM(s.total)::float AS total
    FROM "ErpSale" s
    WHERE ${VALID_SALE} AND ${inRange(start, end)}
    GROUP BY 1
    ORDER BY total DESC`;
}

// ---------------------------------------------------------------------------
// Contas a receber / a pagar. "Em aberto" = não cancelado, pagoEm null e saldo
// > 0 (saldo = valor - valorPago: pagamento parcial abate sem fechar a conta).
// ---------------------------------------------------------------------------

const OPEN_RECEIVABLE = Prisma.sql`r.cancelado = false AND r."pagoEm" IS NULL AND r.valor > r."valorPago"`;
const OPEN_PAYABLE = Prisma.sql`p.cancelado = false AND p."pagoEm" IS NULL AND p.valor > p."valorPago"`;

export async function receivablesOverview() {
  const today = at(storeDayStart(0));
  const in7 = at(storeDayStart(-7));
  const in30 = at(storeDayStart(-30));
  // Faixas de atraso por data de corte calculada aqui, no fuso da loja.
  const late30 = at(storeDayStart(30));
  const late60 = at(storeDayStart(60));
  const late90 = at(storeDayStart(90));

  const [totals] = await prisma.$queryRaw<
    {
      vencidoTotal: number;
      vencidoQtd: number;
      semanaTotal: number;
      semanaQtd: number;
      proximos30: number;
      aging1: number;
      aging31: number;
      aging61: number;
      aging90: number;
    }[]
  >`
    WITH aberto AS (
      SELECT (r.valor - r."valorPago") AS saldo, r.vencimento
      FROM "ErpReceivable" r
      WHERE ${OPEN_RECEIVABLE}
    )
    SELECT
      COALESCE(SUM(saldo) FILTER (WHERE vencimento < ${today}), 0)::float AS "vencidoTotal",
      COUNT(*) FILTER (WHERE vencimento < ${today})::int AS "vencidoQtd",
      COALESCE(SUM(saldo) FILTER (WHERE vencimento >= ${today} AND vencimento < ${in7}), 0)::float AS "semanaTotal",
      COUNT(*) FILTER (WHERE vencimento >= ${today} AND vencimento < ${in7})::int AS "semanaQtd",
      COALESCE(SUM(saldo) FILTER (WHERE vencimento >= ${today} AND vencimento < ${in30}), 0)::float AS "proximos30",
      COALESCE(SUM(saldo) FILTER (WHERE vencimento >= ${late30} AND vencimento < ${today}), 0)::float AS aging1,
      COALESCE(SUM(saldo) FILTER (WHERE vencimento >= ${late60} AND vencimento < ${late30}), 0)::float AS aging31,
      COALESCE(SUM(saldo) FILTER (WHERE vencimento >= ${late90} AND vencimento < ${late60}), 0)::float AS aging61,
      COALESCE(SUM(saldo) FILTER (WHERE vencimento < ${late90}), 0)::float AS aging90
    FROM aberto`;

  // Quem está devendo (parcelas vencidas), maiores saldos primeiro.
  const devedores = await prisma.$queryRaw<
    {
      clienteNome: string;
      clienteTelefone: string | null;
      parcelas: number;
      saldo: number;
      vencimentoMaisAntigo: Date;
    }[]
  >`
    SELECT r."clienteNome", MAX(r."clienteTelefone") AS "clienteTelefone",
           COUNT(*)::int AS parcelas,
           SUM(r.valor - r."valorPago")::float AS saldo,
           MIN(r.vencimento) AS "vencimentoMaisAntigo"
    FROM "ErpReceivable" r
    WHERE ${OPEN_RECEIVABLE} AND r.vencimento < ${today}
    GROUP BY COALESCE(r."clienteCodigo"::text, r."clienteNome"), r."clienteNome"
    ORDER BY saldo DESC
    LIMIT 10`;

  return { ...totals, devedores };
}

type PayableRow = { id: string; fornecedor: string; categoria: string | null; vencimento: Date; saldo: number };

export async function payablesOverview() {
  const today = at(storeDayStart(0));
  const tomorrow = at(storeDayStart(-1));
  const in7 = at(storeDayStart(-7));
  const in30 = at(storeDayStart(-30));

  const [totals] = await prisma.$queryRaw<
    {
      vencidoTotal: number;
      vencidoQtd: number;
      hojeTotal: number;
      semanaTotal: number;
      semanaQtd: number;
      proximos30: number;
    }[]
  >`
    SELECT
      COALESCE(SUM(p.valor - p."valorPago") FILTER (WHERE p.vencimento < ${today}), 0)::float AS "vencidoTotal",
      COUNT(*) FILTER (WHERE p.vencimento < ${today})::int AS "vencidoQtd",
      COALESCE(SUM(p.valor - p."valorPago") FILTER (WHERE p.vencimento >= ${today} AND p.vencimento < ${tomorrow}), 0)::float AS "hojeTotal",
      COALESCE(SUM(p.valor - p."valorPago") FILTER (WHERE p.vencimento >= ${today} AND p.vencimento < ${in7}), 0)::float AS "semanaTotal",
      COUNT(*) FILTER (WHERE p.vencimento >= ${today} AND p.vencimento < ${in7})::int AS "semanaQtd",
      COALESCE(SUM(p.valor - p."valorPago") FILTER (WHERE p.vencimento >= ${today} AND p.vencimento < ${in30}), 0)::float AS "proximos30"
    FROM "ErpPayable" p
    WHERE ${OPEN_PAYABLE}`;

  // Duas listas separadas: se juntasse numa só por vencimento, conta velha
  // esquecida no ERP empurraria as desta semana pra fora da tela.
  // Vencidas: as mais recentes primeiro (as antigas costumam ser lixo do ERP).
  const [vencidas, proximas] = await Promise.all([
    prisma.$queryRaw<PayableRow[]>`
      SELECT p.id, p.fornecedor, p.categoria, p.vencimento, (p.valor - p."valorPago")::float AS saldo
      FROM "ErpPayable" p
      WHERE ${OPEN_PAYABLE} AND p.vencimento < ${today}
      ORDER BY p.vencimento DESC
      LIMIT 5`,
    prisma.$queryRaw<PayableRow[]>`
      SELECT p.id, p.fornecedor, p.categoria, p.vencimento, (p.valor - p."valorPago")::float AS saldo
      FROM "ErpPayable" p
      WHERE ${OPEN_PAYABLE} AND p.vencimento >= ${today} AND p.vencimento < ${in30}
      ORDER BY p.vencimento ASC
      LIMIT 10`,
  ]);

  return { ...totals, vencidas, proximas };
}

// ---------------------------------------------------------------------------
// Produtos
// ---------------------------------------------------------------------------

export type ProductRanking = {
  codigo: number;
  descricao: string;
  grupo: string | null;
  unidade: string | null;
  quantidade: number;
  receita: number;
  lucro: number | null; // null = sem custo
  margemPct: number | null;
  estoque: number | null;
};

export type ProductOrder = "receita" | "quantidade" | "margem";

// Todos os produtos vendidos no período (ordenados por faturamento) — a tela
// usa pra ranking e curva ABC. Custo: soma só dos itens com custo conhecido.
export async function productSales(start: Date, end: Date): Promise<ProductRanking[]> {
  const rows = await prisma.$queryRaw<
    {
      codigo: number;
      descricao: string;
      grupo: string | null;
      unidade: string | null;
      estoque: number | null;
      quantidade: number;
      receita: number;
      receitaComCusto: number;
      custo: number | null;
    }[]
  >`
    SELECT i."produtoCodigo" AS codigo,
           COALESCE(MAX(p.descricao), MAX(i.descricao)) AS descricao,
           MAX(p.grupo) AS grupo,
           MAX(p.unidade) AS unidade,
           MAX(p.estoque)::float AS estoque,
           SUM(i.quantidade)::float AS quantidade,
           SUM(i."valorTotal")::float AS receita,
           COALESCE(SUM(CASE WHEN i."custoUnitario" > 0 THEN i."valorTotal" END), 0)::float AS "receitaComCusto",
           SUM(CASE WHEN i."custoUnitario" > 0 THEN i.quantidade * i."custoUnitario" END)::float AS custo
    FROM "ErpSaleItem" i
    JOIN "ErpSale" s ON s.id = i."saleId"
    LEFT JOIN "ErpProduct" p ON p.codigo = i."produtoCodigo"
    WHERE ${VALID_SALE} AND ${inRange(start, end)}
    GROUP BY i."produtoCodigo"
    ORDER BY receita DESC`;

  return rows.map((r) => {
    const lucro = r.custo != null && r.receitaComCusto > 0 ? r.receitaComCusto - r.custo : null;
    return {
      codigo: r.codigo,
      descricao: r.descricao,
      grupo: r.grupo,
      unidade: r.unidade,
      quantidade: r.quantidade,
      receita: r.receita,
      lucro,
      margemPct: lucro != null ? (lucro / r.receitaComCusto) * 100 : null,
      estoque: r.estoque,
    };
  });
}

export async function revenueByGroup(start: Date, end: Date) {
  return prisma.$queryRaw<{ grupo: string; receita: number }[]>`
    SELECT COALESCE(p.grupo, 'Sem grupo') AS grupo, SUM(i."valorTotal")::float AS receita
    FROM "ErpSaleItem" i
    JOIN "ErpSale" s ON s.id = i."saleId"
    LEFT JOIN "ErpProduct" p ON p.codigo = i."produtoCodigo"
    WHERE ${VALID_SALE} AND ${inRange(start, end)}
    GROUP BY 1
    ORDER BY receita DESC`;
}

export async function stockOverview() {
  const [row] = await prisma.$queryRaw<
    { ativos: number; valorCusto: number; valorVenda: number; semCusto: number; negativos: number }[]
  >`
    SELECT COUNT(*)::int AS ativos,
           COALESCE(SUM(GREATEST(p.estoque, 0) * p.custo), 0)::float AS "valorCusto",
           COALESCE(SUM(GREATEST(p.estoque, 0) * p."precoVarejo"), 0)::float AS "valorVenda",
           COUNT(*) FILTER (WHERE p.custo IS NULL OR p.custo = 0)::int AS "semCusto",
           COUNT(*) FILTER (WHERE p.estoque < 0)::int AS negativos
    FROM "ErpProduct" p
    WHERE p.ativo = true`;
  return row;
}

// Ruptura: produto que VENDE (teve venda nos últimos 30 dias) e está sem estoque.
export async function stockouts(limit = 10) {
  const since = at(storeDayStart(29));
  return prisma.$queryRaw<
    { codigo: number; descricao: string; grupo: string | null; unidade: string; estoque: number; vendido30: number; receita30: number }[]
  >`
    SELECT p.codigo, p.descricao, p.grupo, p.unidade, p.estoque::float AS estoque,
           SUM(i.quantidade)::float AS vendido30, SUM(i."valorTotal")::float AS receita30
    FROM "ErpProduct" p
    JOIN "ErpSaleItem" i ON i."produtoCodigo" = p.codigo
    JOIN "ErpSale" s ON s.id = i."saleId"
    WHERE p.ativo = true AND p.estoque <= 0 AND ${VALID_SALE} AND s.data >= ${since}
    GROUP BY p.codigo, p.descricao, p.grupo, p.unidade, p.estoque
    ORDER BY receita30 DESC
    LIMIT ${limit}`;
}

const DEAD_STOCK_DAYS = 90;

// Parados: tem estoque e não vende há 90+ dias (ou nunca vendeu). Ordenado
// pelo dinheiro parado (estoque × custo). Só dá pra afirmar isso com pelo menos
// 90 dias de vendas no espelho — antes disso `historicoDias` avisa a tela, senão
// logo depois de ligar o ERP o catálogo inteiro apareceria como "nunca vendeu".
// Produto cadastrado há menos de 90 dias também não conta.
export async function deadStock(limit = 10) {
  const since = storeDayStart(DEAD_STOCK_DAYS - 1);
  const [[history], rows] = await Promise.all([
    prisma.$queryRaw<{ primeira: Date | null }[]>`
      SELECT MIN(s.data) AS primeira FROM "ErpSale" s WHERE ${VALID_SALE}`,
    prisma.$queryRaw<
      {
        codigo: number;
        descricao: string;
        grupo: string | null;
        unidade: string;
        estoque: number;
        valorParado: number | null;
        ultimaVenda: Date | null;
      }[]
    >`
      SELECT p.codigo, p.descricao, p.grupo, p.unidade, p.estoque::float AS estoque,
             (CASE WHEN p.custo > 0 THEN p.estoque * p.custo END)::float AS "valorParado",
             (SELECT MAX(s.data) FROM "ErpSaleItem" i JOIN "ErpSale" s ON s.id = i."saleId"
               WHERE i."produtoCodigo" = p.codigo AND ${VALID_SALE}) AS "ultimaVenda"
      FROM "ErpProduct" p
      WHERE p.ativo = true AND p.estoque > 0
        AND (p."cadastradoEm" IS NULL OR p."cadastradoEm" < ${at(since)})
        AND NOT EXISTS (
          SELECT 1 FROM "ErpSaleItem" i JOIN "ErpSale" s ON s.id = i."saleId"
          WHERE i."produtoCodigo" = p.codigo AND ${VALID_SALE} AND s.data >= ${at(since)}
        )
      ORDER BY "valorParado" DESC NULLS LAST`,
  ]);

  const historicoDias = history?.primeira
    ? Math.floor((Date.now() - new Date(history.primeira).getTime()) / 86_400_000)
    : 0;

  return {
    historicoDias,
    historicoSuficiente: historicoDias >= DEAD_STOCK_DAYS,
    dias: DEAD_STOCK_DAYS,
    total: rows.length,
    valorTotal: rows.reduce((sum, r) => sum + (r.valorParado ?? 0), 0),
    itens: rows.slice(0, limit),
  };
}
