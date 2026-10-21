import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clearDemo } from "./demo";
import { lockErpMirror } from "./lock";

// Contrato do que o programa de sincronização (roda no computador da loja,
// lendo o MySQL do Órbita só-leitura) manda pra app/api/erp/sync. Tudo é
// upsert pelo id do próprio ERP — reenviar o mesmo lote não duplica nada, então
// o programa pode reenviar sem medo depois de uma falha de rede, e reenviar os
// últimos dias toda vez (o Órbita não tem "atualizado em": é assim que uma
// venda cancelada depois é percebida).
//
// Contas a receber/pagar: o programa deve reenviar TODOS os títulos ainda em
// aberto a cada ciclo, incluindo os que foram cancelados/excluídos no Órbita
// (com `cancelado: true`) — é o único jeito do espelho saber que um título
// deixou de valer.
//
// Uma vez por dia o programa manda também openReceivableIds/openPayableIds: a
// lista COMPLETA dos títulos em aberto no Órbita. Título que está em aberto
// aqui e não veio na lista deixou de valer lá (pago, cancelado, excluído) sem
// o programa ter visto — fica marcado como cancelado e sai das contas, e os
// ids voltam na resposta pro programa mandar o estado real no ciclo seguinte.
// Cobre o programa ter perdido o arquivo do que já mandou.
//
// Datas vêm em ISO COM fuso (ex.: "2026-09-26T14:30:00-03:00") — o MySQL do
// Órbita guarda horário local sem fuso, quem converte é o programa da loja.
//
// Limites batem com as colunas do Postgres (INT4, Decimal(14,x)): um valor fora
// disso é recusado aqui com 400 dizendo o campo, em vez de estourar no meio da
// gravação.

const erpInt = z.number().int().min(-2_147_483_648).max(2_147_483_647);
const money = z.number().finite().min(-999_999_999_999).max(999_999_999_999);
// Custo é Decimal(14,4): só 10 dígitos antes da vírgula, menos que `money`.
const unitCost = z.number().finite().min(-9_999_999_999).max(9_999_999_999);
const qty = z.number().finite().min(-9_999_999_999).max(9_999_999_999);
const isoDate = z.string().datetime({ offset: true }).transform((s) => new Date(s));
// Postgres não aceita o caractere NUL em texto.
const text = (max: number) => z.string().max(max).transform((s) => s.replace(/\u0000/g, ""));
const requiredText = (max: number) => z.string().min(1).max(max).transform((s) => s.replace(/\u0000/g, ""));

const productSchema = z.object({
  codigo: erpInt,
  descricao: requiredText(300),
  grupo: text(120).nullish(),
  marca: text(120).nullish(),
  unidade: text(10).default("UN"),
  precoVarejo: money,
  custo: unitCost.nullish(),
  estoque: qty,
  estoqueMinimo: qty.nullish(),
  ativo: z.boolean().default(true),
  cadastradoEm: isoDate.nullish(),
});

const saleSchema = z.object({
  erpId: erpInt,
  data: isoDate,
  total: money,
  bruto: money,
  desconto: money.default(0),
  frete: money.default(0),
  modelo: text(10).nullish(),
  vendedor: text(120).nullish(),
  clienteCodigo: erpInt.nullish(),
  clienteNome: text(200).nullish(),
  cancelada: z.boolean().default(false),
  items: z
    .array(
      z.object({
        produtoCodigo: erpInt,
        descricao: requiredText(300),
        quantidade: qty,
        valorTotal: money,
        custoUnitario: unitCost.nullish(),
      })
    )
    .max(1000),
  payments: z.array(z.object({ forma: requiredText(80), valor: money })).max(50),
});

const receivableSchema = z.object({
  erpId: erpInt,
  clienteCodigo: erpInt.nullish(),
  clienteNome: requiredText(200),
  clienteTelefone: text(30).nullish(),
  documento: text(80).nullish(),
  vencimento: isoDate,
  valor: money,
  valorPago: money.default(0),
  pagoEm: isoDate.nullish(),
  cancelado: z.boolean().default(false),
});

const payableSchema = z.object({
  erpId: erpInt,
  fornecedor: requiredText(200),
  categoria: text(120).nullish(),
  vencimento: isoDate,
  valor: money,
  valorPago: money.default(0),
  pagoEm: isoDate.nullish(),
  cancelado: z.boolean().default(false),
});

export const syncPayloadSchema = z.object({
  products: z.array(productSchema).max(5000).default([]),
  sales: z.array(saleSchema).max(2000).default([]),
  receivables: z.array(receivableSchema).max(5000).default([]),
  payables: z.array(payableSchema).max(5000).default([]),
  openReceivableIds: z.array(erpInt).max(200_000).optional(),
  openPayableIds: z.array(erpInt).max(200_000).optional(),
  // O pedido do "Atualizar agora" que esta rodada atendeu (o valor que o GET
  // devolveu quando ela começou) — vem no último POST da rodada. Ver
  // lib/erp/sync-request.ts.
  handledRequestAt: isoDate.optional(),
});

export type SyncPayload = z.infer<typeof syncPayloadSchema>;

// Custo 0 no Órbita = produto sem custo lançado (customedio zerado). Guardar
// como null, senão o item entra na margem com custo zero = 100% de lucro.
function knownCost(value: number | null | undefined): number | null {
  return value != null && value > 0 ? value : null;
}

export async function applySyncPayload(payload: SyncPayload) {
  // Antes de gravar qualquer coisa: apaga a demonstração (as telas nunca
  // misturam número fictício com número da loja) e marca que o ERP real já
  // começou a sincronizar — a partir daqui a demo não pode mais ser carregada.
  // Tudo sob a mesma trava da geração da demo (lib/erp/lock.ts).
  await prisma.$transaction(
    async (tx) => {
      await lockErpMirror(tx);
      await clearDemo(tx);
      await tx.erpSyncState.upsert({ where: { id: "erp" }, create: { id: "erp" }, update: {} });
    },
    { timeout: 120_000, maxWait: 30_000 }
  );

  // `demo: false` explícito em todo upsert: dado que veio do ERP nunca fica
  // marcado como demonstração, aconteça o que acontecer.
  for (const p of payload.products) {
    const data = {
      descricao: p.descricao,
      grupo: p.grupo ?? null,
      marca: p.marca ?? null,
      unidade: p.unidade,
      precoVarejo: p.precoVarejo,
      custo: knownCost(p.custo),
      estoque: p.estoque,
      estoqueMinimo: p.estoqueMinimo ?? null,
      ativo: p.ativo,
      cadastradoEm: p.cadastradoEm ?? null,
      demo: false,
    };
    await prisma.erpProduct.upsert({ where: { codigo: p.codigo }, create: { codigo: p.codigo, ...data }, update: data });
  }

  // Uma transação por venda: cabeçalho + itens + pagamentos trocados juntos,
  // nunca uma venda pela metade (ex.: itens novos com total antigo).
  for (const s of payload.sales) {
    const header = {
      data: s.data,
      total: s.total,
      bruto: s.bruto,
      desconto: s.desconto,
      frete: s.frete,
      modelo: s.modelo ?? null,
      vendedor: s.vendedor ?? null,
      clienteCodigo: s.clienteCodigo ?? null,
      clienteNome: s.clienteNome ?? null,
      cancelada: s.cancelada,
      demo: false,
    };
    await prisma.$transaction(async (tx) => {
      const sale = await tx.erpSale.upsert({
        where: { erpId: s.erpId },
        create: { erpId: s.erpId, ...header },
        update: header,
        select: { id: true },
      });
      await tx.erpSaleItem.deleteMany({ where: { saleId: sale.id } });
      await tx.erpSalePayment.deleteMany({ where: { saleId: sale.id } });
      if (s.items.length) {
        await tx.erpSaleItem.createMany({
          data: s.items.map((i) => ({ ...i, custoUnitario: knownCost(i.custoUnitario), saleId: sale.id })),
        });
      }
      if (s.payments.length) {
        await tx.erpSalePayment.createMany({ data: s.payments.map((p) => ({ ...p, saleId: sale.id })) });
      }
    });
  }

  for (const r of payload.receivables) {
    const data = {
      clienteCodigo: r.clienteCodigo ?? null,
      clienteNome: r.clienteNome,
      clienteTelefone: r.clienteTelefone ?? null,
      documento: r.documento ?? null,
      vencimento: r.vencimento,
      valor: r.valor,
      valorPago: r.valorPago,
      pagoEm: r.pagoEm ?? null,
      cancelado: r.cancelado,
      demo: false,
    };
    await prisma.erpReceivable.upsert({ where: { erpId: r.erpId }, create: { erpId: r.erpId, ...data }, update: data });
  }

  for (const p of payload.payables) {
    const data = {
      fornecedor: p.fornecedor,
      categoria: p.categoria ?? null,
      vencimento: p.vencimento,
      valor: p.valor,
      valorPago: p.valorPago,
      pagoEm: p.pagoEm ?? null,
      cancelado: p.cancelado,
      demo: false,
    };
    await prisma.erpPayable.upsert({ where: { erpId: p.erpId }, create: { erpId: p.erpId, ...data }, update: data });
  }

  // Depois dos upserts: título novo em aberto do mesmo envio já está gravado.
  // ANY(array) e não IN (...): a lista pode passar do limite de parâmetros.
  // Os ids voltam pro programa, que relê esses títulos no Órbita e manda o
  // estado real (um pago não fica como cancelado).
  let closedReceivableIds: number[] | undefined;
  let closedPayableIds: number[] | undefined;
  if (payload.openReceivableIds) {
    const rows = await prisma.$queryRaw<{ erpId: number }[]>`
      UPDATE "ErpReceivable" SET cancelado = true
      WHERE demo = false AND cancelado = false AND "pagoEm" IS NULL
        AND NOT ("erpId" = ANY(${payload.openReceivableIds}::int[]))
      RETURNING "erpId"`;
    closedReceivableIds = rows.map((r) => r.erpId);
  }
  if (payload.openPayableIds) {
    const rows = await prisma.$queryRaw<{ erpId: number }[]>`
      UPDATE "ErpPayable" SET cancelado = true
      WHERE demo = false AND cancelado = false AND "pagoEm" IS NULL
        AND NOT ("erpId" = ANY(${payload.openPayableIds}::int[]))
      RETURNING "erpId"`;
    closedPayableIds = rows.map((r) => r.erpId);
  }

  const counts = {
    products: payload.products.length,
    sales: payload.sales.length,
    receivables: payload.receivables.length,
    payables: payload.payables.length,
    ...(closedReceivableIds && { closedReceivables: closedReceivableIds.length }),
    ...(closedPayableIds && { closedPayables: closedPayableIds.length }),
  };
  const now = new Date();
  await prisma.erpSyncState.upsert({
    where: { id: "erp" },
    create: { id: "erp", lastSyncAt: now, lastBatch: counts },
    update: { lastSyncAt: now, lastBatch: counts },
  });
  // Só limpa se ninguém pediu de novo depois que a rodada começou.
  if (payload.handledRequestAt) {
    await prisma.erpSyncState.updateMany({
      where: { id: "erp", requestedAt: { lte: payload.handledRequestAt } },
      data: { requestedAt: null },
    });
  }
  return { counts, closedReceivableIds, closedPayableIds };
}
