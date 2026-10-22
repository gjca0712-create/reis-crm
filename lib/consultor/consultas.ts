import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { storeDayStart } from "@/lib/erp/period";
import { VALID_SALE, at, inRange, LOCAL_DATA } from "@/lib/erp/queries";

// Consultas que só o Consultor IA usa, em cima do espelho do ERP e das tabelas
// do CRM. Mesmas convenções de lib/erp/queries.ts: agregação no Postgres, toda
// soma com ::float e toda contagem com ::int.

const DIA_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Vendas no tempo
// ---------------------------------------------------------------------------

export type Agrupamento = "dia" | "semana" | "mes" | "dia_semana" | "hora";

const CHAVE: Record<Agrupamento, Prisma.Sql> = {
  dia: Prisma.sql`to_char(${LOCAL_DATA}, 'YYYY-MM-DD')`,
  // Semana começando na segunda-feira (date_trunc do Postgres).
  semana: Prisma.sql`to_char(date_trunc('week', ${LOCAL_DATA}), 'YYYY-MM-DD')`,
  mes: Prisma.sql`to_char(${LOCAL_DATA}, 'YYYY-MM')`,
  // 1 = segunda ... 7 = domingo.
  dia_semana: Prisma.sql`EXTRACT(ISODOW FROM ${LOCAL_DATA})::int::text`,
  hora: Prisma.sql`EXTRACT(HOUR FROM ${LOCAL_DATA})::int::text`,
};

export async function serieDeVendas(inicio: Date, fim: Date, agrupar: Agrupamento) {
  return prisma.$queryRaw<{ chave: string; vendas: number; receita: number }[]>`
    SELECT ${CHAVE[agrupar]} AS chave, COUNT(*)::int AS vendas, SUM(s.total)::float AS receita
    FROM "ErpSale" s
    WHERE ${VALID_SALE} AND ${inRange(inicio, fim)}
    GROUP BY 1
    ORDER BY 1`;
}

// ---------------------------------------------------------------------------
// Grupos e produtos
// ---------------------------------------------------------------------------

export async function vendasPorGrupoComMargem(inicio: Date, fim: Date) {
  return prisma.$queryRaw<
    { grupo: string; produtos: number; quantidade: number; receita: number; receitaComCusto: number; custo: number }[]
  >`
    SELECT COALESCE(p.grupo, 'Sem grupo') AS grupo,
           COUNT(DISTINCT i."produtoCodigo")::int AS produtos,
           SUM(i.quantidade)::float AS quantidade,
           SUM(i."valorTotal")::float AS receita,
           COALESCE(SUM(CASE WHEN i."custoUnitario" > 0 THEN i."valorTotal" END), 0)::float AS "receitaComCusto",
           COALESCE(SUM(CASE WHEN i."custoUnitario" > 0 THEN i.quantidade * i."custoUnitario" END), 0)::float AS custo
    FROM "ErpSaleItem" i
    JOIN "ErpSale" s ON s.id = i."saleId"
    LEFT JOIN "ErpProduct" p ON p.codigo = i."produtoCodigo"
    WHERE ${VALID_SALE} AND ${inRange(inicio, fim)}
    GROUP BY 1
    ORDER BY receita DESC`;
}

// Produto ativo com estoque mínimo cadastrado e saldo igual ou abaixo dele —
// os que vendem primeiro.
export async function abaixoDoMinimo(limite: number) {
  const desde = at(storeDayStart(29));
  const [[total], itens] = await Promise.all([
    prisma.$queryRaw<{ qtd: number }[]>`
      SELECT COUNT(*)::int AS qtd FROM "ErpProduct" p
      WHERE p.ativo = true AND p."estoqueMinimo" > 0 AND p.estoque <= p."estoqueMinimo"`,
    prisma.$queryRaw<
      { codigo: number; descricao: string; grupo: string | null; unidade: string; estoque: number; estoqueMinimo: number; vendido30: number }[]
    >`
      SELECT p.codigo, p.descricao, p.grupo, p.unidade, p.estoque::float AS estoque, p."estoqueMinimo"::float AS "estoqueMinimo",
             COALESCE((SELECT SUM(i.quantidade) FROM "ErpSaleItem" i JOIN "ErpSale" s ON s.id = i."saleId"
                        WHERE i."produtoCodigo" = p.codigo AND ${VALID_SALE} AND s.data >= ${desde}), 0)::float AS vendido30
      FROM "ErpProduct" p
      WHERE p.ativo = true AND p."estoqueMinimo" > 0 AND p.estoque <= p."estoqueMinimo"
      ORDER BY vendido30 DESC, p.descricao
      LIMIT ${limite}`,
  ]);
  return { total: total.qtd, itens };
}

// Busca sem acento e sem diferença de maiúscula: "eletrico" acha "ELÉTRICO".
const COM_ACENTO = "áàâãäéèêëíìîïóòôõöúùûüç";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuuc";

export function normalizarBusca(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[%_\\]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 6);
}

export async function buscarProdutos(busca: string, limite: number) {
  const termos = normalizarBusca(busca);
  const codigo = /^\d{1,9}$/.test(busca.trim()) ? Number(busca.trim()) : null;
  if (termos.length === 0 && codigo === null) return [];

  const porTexto = termos.length
    ? Prisma.join(
        termos.map((t) => Prisma.sql`translate(lower(p.descricao), ${COM_ACENTO}, ${SEM_ACENTO}) LIKE ${`%${t}%`}`),
        " AND "
      )
    : Prisma.sql`false`;
  const desde30 = at(storeDayStart(29));
  const desde90 = at(storeDayStart(89));

  return prisma.$queryRaw<
    {
      codigo: number;
      descricao: string;
      grupo: string | null;
      marca: string | null;
      unidade: string;
      preco: number;
      custo: number | null;
      estoque: number;
      estoqueMinimo: number | null;
      ativo: boolean;
      qtd30: number;
      receita30: number;
      qtd90: number;
      receita90: number;
      ultimaVenda: Date | null;
    }[]
  >`
    SELECT p.codigo, p.descricao, p.grupo, p.marca, p.unidade, p."precoVarejo"::float AS preco,
           (CASE WHEN p.custo > 0 THEN p.custo END)::float AS custo,
           p.estoque::float AS estoque, p."estoqueMinimo"::float AS "estoqueMinimo", p.ativo,
           COALESCE(v.qtd30, 0)::float AS qtd30, COALESCE(v.receita30, 0)::float AS receita30,
           COALESCE(v.qtd90, 0)::float AS qtd90, COALESCE(v.receita90, 0)::float AS receita90,
           v."ultimaVenda"
    FROM "ErpProduct" p
    LEFT JOIN LATERAL (
      SELECT SUM(i.quantidade) FILTER (WHERE s.data >= ${desde30}) AS qtd30,
             SUM(i."valorTotal") FILTER (WHERE s.data >= ${desde30}) AS receita30,
             SUM(i.quantidade) FILTER (WHERE s.data >= ${desde90}) AS qtd90,
             SUM(i."valorTotal") FILTER (WHERE s.data >= ${desde90}) AS receita90,
             MAX(s.data) AS "ultimaVenda"
      FROM "ErpSaleItem" i JOIN "ErpSale" s ON s.id = i."saleId"
      WHERE i."produtoCodigo" = p.codigo AND ${VALID_SALE}
    ) v ON true
    WHERE ${codigo !== null ? Prisma.sql`(p.codigo = ${codigo} OR (${porTexto}))` : porTexto}
    ORDER BY (p.codigo = ${codigo ?? -1}) DESC, p.ativo DESC, receita90 DESC, p.descricao
    LIMIT ${limite}`;
}

// Combos: o que sai na mesma venda que o produto. "vendasJuntas" = em quantas
// das vendas do produto o outro também estava.
export async function compradosJuntos(codigo: number, inicio: Date, fim: Date, limite: number) {
  const [[base], itens] = await Promise.all([
    prisma.$queryRaw<{ vendas: number }[]>`
      SELECT COUNT(DISTINCT i."saleId")::int AS vendas
      FROM "ErpSaleItem" i JOIN "ErpSale" s ON s.id = i."saleId"
      WHERE i."produtoCodigo" = ${codigo} AND ${VALID_SALE} AND ${inRange(inicio, fim)}`,
    prisma.$queryRaw<{ codigo: number; descricao: string; vendasJuntas: number; quantidade: number; receita: number }[]>`
      WITH alvo AS (
        SELECT DISTINCT i."saleId"
        FROM "ErpSaleItem" i JOIN "ErpSale" s ON s.id = i."saleId"
        WHERE i."produtoCodigo" = ${codigo} AND ${VALID_SALE} AND ${inRange(inicio, fim)}
      )
      SELECT j."produtoCodigo" AS codigo, MAX(j.descricao) AS descricao,
             COUNT(DISTINCT j."saleId")::int AS "vendasJuntas",
             SUM(j.quantidade)::float AS quantidade, SUM(j."valorTotal")::float AS receita
      FROM "ErpSaleItem" j JOIN alvo a ON a."saleId" = j."saleId"
      WHERE j."produtoCodigo" <> ${codigo}
      GROUP BY j."produtoCodigo"
      ORDER BY "vendasJuntas" DESC, receita DESC
      LIMIT ${limite}`,
  ]);
  return { vendasDoProduto: base.vendas, itens };
}

// ---------------------------------------------------------------------------
// Clientes do ERP (quem compra no caixa, identificado pelo código do cliente)
// ---------------------------------------------------------------------------

// Consumidor final vem com clienteCodigo null; o filtro por nome é defesa pra
// um cadastro genérico "CONSUMIDOR" que alguma loja use no lugar.
const CLIENTE_IDENTIFICADO = Prisma.sql`s."clienteCodigo" IS NOT NULL AND COALESCE(s."clienteNome", '') NOT ILIKE '%consumidor%'`;

export async function clientesQueMaisCompram(inicio: Date, fim: Date, limite: number) {
  const [[totais], clientes] = await Promise.all([
    prisma.$queryRaw<{ receita: number; receitaIdentificada: number; qtdClientes: number }[]>`
      SELECT COALESCE(SUM(s.total), 0)::float AS receita,
             COALESCE(SUM(s.total) FILTER (WHERE ${CLIENTE_IDENTIFICADO}), 0)::float AS "receitaIdentificada",
             COUNT(DISTINCT s."clienteCodigo") FILTER (WHERE ${CLIENTE_IDENTIFICADO})::int AS "qtdClientes"
      FROM "ErpSale" s
      WHERE ${VALID_SALE} AND ${inRange(inicio, fim)}`,
    prisma.$queryRaw<{ codigo: number; nome: string | null; compras: number; total: number; ultimaCompra: Date }[]>`
      SELECT s."clienteCodigo" AS codigo, MAX(s."clienteNome") AS nome, COUNT(*)::int AS compras,
             SUM(s.total)::float AS total, MAX(s.data) AS "ultimaCompra"
      FROM "ErpSale" s
      WHERE ${VALID_SALE} AND ${inRange(inicio, fim)} AND ${CLIENTE_IDENTIFICADO}
      GROUP BY s."clienteCodigo"
      ORDER BY total DESC
      LIMIT ${limite}`,
  ]);
  return { ...totais, clientes };
}

// Cliente que comprava (pelo menos `minimoCompras` vezes nos 12 meses antes) e
// não compra há `dias` dias — os que mais gastavam primeiro.
export async function clientesQueSumiram(dias: number, minimoCompras: number, limite: number) {
  const corte = at(storeDayStart(dias - 1));
  const ano = at(storeDayStart(364));
  const linhas = await prisma.$queryRaw<{ codigo: number; nome: string | null; ultimaCompra: Date; compras12m: number; total12m: number }[]>`
    WITH c AS (
      SELECT s."clienteCodigo" AS codigo, MAX(s."clienteNome") AS nome, MAX(s.data) AS "ultimaCompra",
             COUNT(*) FILTER (WHERE s.data >= ${ano})::int AS "compras12m",
             COALESCE(SUM(s.total) FILTER (WHERE s.data >= ${ano}), 0)::float AS "total12m"
      FROM "ErpSale" s
      WHERE ${VALID_SALE} AND ${CLIENTE_IDENTIFICADO}
      GROUP BY s."clienteCodigo"
    )
    SELECT * FROM c
    WHERE "ultimaCompra" < ${corte} AND "compras12m" >= ${minimoCompras}
    ORDER BY "total12m" DESC`;
  return {
    total: linhas.length,
    valor12m: linhas.reduce((soma, l) => soma + l.total12m, 0),
    itens: linhas.slice(0, limite).map((l) => ({
      ...l,
      diasSemComprar: Math.floor((Date.now() - new Date(l.ultimaCompra).getTime()) / DIA_MS),
    })),
  };
}

// ---------------------------------------------------------------------------
// CRM: cadastro da fidelidade e parceiros
// ---------------------------------------------------------------------------

export async function resumoClientesCrm(mesAtual: number) {
  const ha30 = storeDayStart(29);
  const ha60 = storeDayStart(59);
  const ha90 = storeDayStart(89);
  const ano = storeDayStart(364);

  const [total, novos30, porBairro, porFase, fidelidade, recencia, aniversariantes] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: { createdAt: { gte: ha30 } } }),
    prisma.$queryRaw<{ bairro: string; clientes: number; vendas12m: number; total12m: number }[]>`
      SELECT COALESCE(NULLIF(TRIM(c.bairro), ''), 'Sem bairro') AS bairro, COUNT(DISTINCT c.id)::int AS clientes,
             COUNT(s.id)::int AS "vendas12m", COALESCE(SUM(s.total), 0)::float AS "total12m"
      FROM "Customer" c
      LEFT JOIN "Sale" s ON s."customerId" = c.id AND s.date >= ${at(ano)}
      GROUP BY 1
      ORDER BY "total12m" DESC, clientes DESC
      LIMIT 15`,
    prisma.customer.groupBy({ by: ["faseObra"], _count: { _all: true } }),
    prisma.customer.aggregate({ _sum: { loyaltyPoints: true }, where: { loyaltyPoints: { gt: 0 } }, _count: { _all: true } }),
    prisma.$queryRaw<{ faixa: string; clientes: number }[]>`
      SELECT CASE
               WHEN x.ultima IS NULL THEN 'sem compra registrada'
               WHEN x.ultima >= ${at(ha30)} THEN 'comprou em até 30 dias'
               WHEN x.ultima >= ${at(ha60)} THEN '31 a 60 dias'
               WHEN x.ultima >= ${at(ha90)} THEN '61 a 90 dias'
               ELSE 'mais de 90 dias sem comprar'
             END AS faixa,
             COUNT(*)::int AS clientes
      FROM (SELECT c.id, MAX(s.date) AS ultima FROM "Customer" c LEFT JOIN "Sale" s ON s."customerId" = c.id GROUP BY c.id) x
      GROUP BY 1
      ORDER BY 2 DESC`,
    prisma.$queryRaw<{ nome: string; dia: number }[]>`
      SELECT c.name AS nome, EXTRACT(DAY FROM c.birthday)::int AS dia
      FROM "Customer" c
      WHERE c.birthday IS NOT NULL AND EXTRACT(MONTH FROM c.birthday) = ${mesAtual}
      ORDER BY dia, nome`,
  ]);

  return { total, novos30, porBairro, porFase, fidelidade, recencia, aniversariantes };
}

export async function resumoParceiros(inicio: Date, fim: Date, limite: number) {
  return prisma.$queryRaw<
    { nome: string; profissao: string; saldoCashback: number; clientesIndicados: number; vendas: number; total: number; cashback: number }[]
  >`
    SELECT p.name AS nome, p.profissao, p."cashbackBalance"::float AS "saldoCashback",
           (SELECT COUNT(*) FROM "Customer" c WHERE c."referredById" = p.id)::int AS "clientesIndicados",
           COUNT(s.id)::int AS vendas, COALESCE(SUM(s.total), 0)::float AS total,
           COALESCE(SUM(s."cashbackAmount"), 0)::float AS cashback
    FROM "Partner" p
    LEFT JOIN "Sale" s ON s."partnerId" = p.id AND s.date >= ${at(inicio)} AND s.date < ${at(fim)}
    GROUP BY p.id
    ORDER BY total DESC, "clientesIndicados" DESC
    LIMIT ${limite}`;
}
