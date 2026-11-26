// Leituras do AlphaDashboard que alimentam o espelho do ERP (tabelas Erp*).
// Cada função lê a API, compara com o que já está no banco e só grava o que
// mudou (applySyncPayload faz upsert um a um: regravar 8 mil produtos iguais
// toda hora pesaria à toa).
import { prisma } from "@/lib/prisma";
import { applySyncPayload, syncPayloadSchema, type SyncPayload } from "../sync";
import type { AlphaClient } from "./client";
import {
  diaLoja,
  mapearPagar,
  mapearProduto,
  mapearReceber,
  mapearVenda,
  numero,
  type ContaApi,
  type ProdutoApi,
  type VendaApi,
} from "./map";

type Bruto = Record<string, unknown>;
type Resultado = { lidos: number; gravados: number; recusados: number; avisos: string[] };

const POR_PAGINA = 100; // máximo da API
const MAX_PAGINAS = 1000;
const LIMITE_LISTA_VENDAS = 200; // /vendas-dia lista no máximo as 200 mais recentes

// Valida registro por registro com o mesmo schema da rota de sincronização:
// um registro fora do padrão é descartado (e contado), sem derrubar o lote.
function validar<K extends "products" | "sales" | "receivables" | "payables">(chave: K, lista: unknown[]) {
  const ok: SyncPayload[K] = [] as unknown as SyncPayload[K];
  let recusados = 0;
  for (const item of lista) {
    const r = syncPayloadSchema.safeParse({ [chave]: [item] });
    if (r.success) (ok as unknown[]).push(r.data[chave][0]);
    else recusados++;
  }
  return { ok, recusados };
}

async function gravar(parcial: Partial<SyncPayload>) {
  const payload: SyncPayload = { products: [], sales: [], receivables: [], payables: [], ...parcial };
  await applySyncPayload(payload);
}

async function lerPaginas<T>(client: AlphaClient, path: string, params: Record<string, string>, chave: string) {
  const itens: T[] = [];
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const resp = await client.get<Bruto>(path, { ...params, page, pageSize: POR_PAGINA });
    const lista = Array.isArray(resp[chave]) ? (resp[chave] as T[]) : [];
    itens.push(...lista);
    const total = numero(resp.totalCount);
    if (!lista.length || lista.length < POR_PAGINA || (total !== null && itens.length >= total)) {
      return { itens, completo: true };
    }
  }
  return { itens, completo: false };
}

const mesmoNumero = (a: unknown, b: number | null | undefined) =>
  (a === null || a === undefined) === (b === null || b === undefined) &&
  (a === null || a === undefined || Math.abs(Number(a) - Number(b)) < 0.00005);
const mesmaData = (a: Date | null | undefined, b: Date | null | undefined) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

// ---------------------------------------------------------------------------
// Vendas: um dia por consulta (/vendas-dia?date=)
// ---------------------------------------------------------------------------

export async function importarVendas(
  client: AlphaClient,
  dias: string[],
  { handledRequestAt, sempreGravar = false }: { handledRequestAt?: string; sempreGravar?: boolean } = {}
): Promise<Resultado> {
  const brutas: unknown[] = [];
  const avisos: string[] = [];
  let lidos = 0;
  for (const dia of dias) {
    const resp = await client.get<{ vendas?: VendaApi[]; resumoPeriodo?: { totalVendas?: unknown } }>("/vendas-dia", { date: dia });
    const vendas = Array.isArray(resp.vendas) ? resp.vendas : [];
    lidos += vendas.length;
    for (const v of vendas) {
      const m = mapearVenda(v);
      if (m) brutas.push(m);
    }
    // A lista vem cortada nas 200 mais recentes: num dia com mais vendas que
    // isso, as mais cedo ficam de fora do espelho (pedido feito pra Alpha:
    // listagem paginada sem corte).
    const totalDia = numero(resp.resumoPeriodo?.totalVendas);
    if (vendas.length >= LIMITE_LISTA_VENDAS && totalDia !== null && totalDia > vendas.length) {
      avisos.push(`${dia}: a API listou ${vendas.length} de ${totalDia} vendas`);
    }
  }

  const { ok: vendas, recusados } = validar("sales", brutas);
  const atuais = new Map(
    (
      await prisma.erpSale.findMany({
        where: { erpId: { in: vendas.map((v) => v.erpId) } },
        select: { erpId: true, data: true, total: true, bruto: true, desconto: true, modelo: true, vendedor: true, clienteNome: true, cancelada: true, demo: true },
      })
    ).map((s) => [s.erpId, s])
  );
  const mudaram = vendas.filter((v) => {
    const s = atuais.get(v.erpId);
    return (
      !s ||
      s.demo ||
      !mesmaData(s.data, v.data) ||
      !mesmoNumero(s.total, v.total) ||
      !mesmoNumero(s.bruto, v.bruto) ||
      !mesmoNumero(s.desconto, v.desconto) ||
      s.modelo !== (v.modelo ?? null) ||
      s.vendedor !== (v.vendedor ?? null) ||
      s.clienteNome !== (v.clienteNome ?? null) ||
      s.cancelada !== v.cancelada
    );
  });

  // Lotes de até 2000 vendas (limite do contrato). O último leva o pedido do
  // botão "Atualizar agora", que só se limpa no fim.
  const lotes: (typeof mudaram)[] = [];
  for (let i = 0; i < mudaram.length; i += 2000) lotes.push(mudaram.slice(i, i + 2000));
  if (!lotes.length && (sempreGravar || handledRequestAt)) lotes.push([]);
  for (let i = 0; i < lotes.length; i++) {
    const ultimo = i === lotes.length - 1;
    await gravar({ sales: lotes[i], ...(ultimo && handledRequestAt ? { handledRequestAt: new Date(handledRequestAt) } : {}) });
  }
  return { lidos, gravados: mudaram.length, recusados, avisos };
}

// ---------------------------------------------------------------------------
// Produtos: catálogo inteiro (/estoque, páginas de 100)
// ---------------------------------------------------------------------------

export async function importarProdutos(client: AlphaClient): Promise<Resultado> {
  const { itens, completo } = await lerPaginas<ProdutoApi>(client, "/estoque", { status: "todos" }, "produtos");
  const avisos: string[] = [];
  let semCodigo = 0;
  const brutos: unknown[] = [];
  for (const p of itens) {
    const m = mapearProduto(p);
    if (m) brutos.push(m);
    else semCodigo++;
  }
  if (semCodigo) avisos.push(`${semCodigo} produtos sem código numérico ficaram de fora`);
  if (!completo) avisos.push("catálogo não terminou de ler; nenhum produto foi desativado nesta rodada");

  const { ok: produtos, recusados } = validar("products", brutos);
  const atuais = new Map(
    (
      await prisma.erpProduct.findMany({
        select: {
          codigo: true, descricao: true, grupo: true, marca: true, unidade: true, precoVarejo: true, custo: true,
          estoque: true, estoqueMinimo: true, ativo: true, cadastradoEm: true, demo: true,
        },
      })
    ).map((p) => [p.codigo, p])
  );

  const gravar_: SyncPayload["products"] = [];
  const vistos = new Set<number>();
  for (const p of produtos) {
    vistos.add(p.codigo);
    const a = atuais.get(p.codigo);
    // A API não manda marca, unidade nem data de cadastro: mantém o que já havia.
    const novo = { ...p, marca: a?.marca ?? null, unidade: a?.unidade ?? p.unidade, cadastradoEm: a?.cadastradoEm ?? null };
    const igual =
      a &&
      !a.demo &&
      a.descricao === novo.descricao &&
      a.grupo === (novo.grupo ?? null) &&
      mesmoNumero(a.precoVarejo, novo.precoVarejo) &&
      mesmoNumero(a.custo, novo.custo ?? null) &&
      mesmoNumero(a.estoque, novo.estoque) &&
      mesmoNumero(a.estoqueMinimo, novo.estoqueMinimo ?? null) &&
      a.ativo === novo.ativo;
    if (!igual) gravar_.push(novo);
  }
  // O /estoque traz só produto ativo: o que sumiu do catálogo foi desativado no
  // Órbita. Só com a leitura completa, senão uma falha no meio desativaria tudo.
  if (completo && produtos.length) {
    for (const a of atuais.values()) {
      if (a.demo || !a.ativo || vistos.has(a.codigo)) continue;
      gravar_.push({
        codigo: a.codigo, descricao: a.descricao, grupo: a.grupo, marca: a.marca, unidade: a.unidade,
        precoVarejo: Number(a.precoVarejo), custo: a.custo === null ? null : Number(a.custo), estoque: Number(a.estoque),
        estoqueMinimo: a.estoqueMinimo === null ? null : Number(a.estoqueMinimo), ativo: false, cadastradoEm: a.cadastradoEm,
      });
    }
  }
  for (let i = 0; i < gravar_.length; i += 5000) await gravar({ products: gravar_.slice(i, i + 5000) });
  return { lidos: itens.length, gravados: gravar_.length, recusados, avisos };
}

// ---------------------------------------------------------------------------
// Contas a receber e a pagar (/financeiro)
// ---------------------------------------------------------------------------

// Todos os títulos em aberto + os baixados/cancelados com vencimento a partir
// de `diasFechados` atrás. A lista dos abertos vai em openReceivableIds/
// openPayableIds: título aberto no CRM que não está mais aberto lá sai das
// contas (ver applySyncPayload).
export async function importarContas(client: AlphaClient, { diasFechados }: { diasFechados: number }): Promise<Resultado> {
  const avisos: string[] = [];
  let lidos = 0;
  let recusados = 0;
  const desde = diaLoja(-diasFechados);
  const ate = diaLoja(3650);

  async function ler(type: "receber" | "pagar") {
    const abertos = await lerPaginas<ContaApi>(client, "/financeiro", { type, status: "aberto" }, "contas");
    const fechados: ContaApi[] = [];
    for (const status of ["baixado", "cancelado"]) {
      const r = await lerPaginas<ContaApi>(client, "/financeiro", { type, status, startDate: desde, endDate: ate }, "contas");
      fechados.push(...r.itens);
    }
    lidos += abertos.itens.length + fechados.length;
    if (!abertos.completo) avisos.push(`contas a ${type}: lista de abertos não terminou de ler`);
    return { abertos, todos: [...abertos.itens, ...fechados] };
  }

  const receber = await ler("receber");
  const pagar = await ler("pagar");

  const r = validar("receivables", receber.todos.map(mapearReceber).filter(Boolean));
  const p = validar("payables", pagar.todos.map(mapearPagar).filter(Boolean));
  recusados += r.recusados + p.recusados;

  const atuaisR = new Map(
    (await prisma.erpReceivable.findMany({ where: { erpId: { in: r.ok.map((x) => x.erpId) } } })).map((x) => [x.erpId, x])
  );
  const atuaisP = new Map(
    (await prisma.erpPayable.findMany({ where: { erpId: { in: p.ok.map((x) => x.erpId) } } })).map((x) => [x.erpId, x])
  );
  const receivables = r.ok.filter((x) => {
    const a = atuaisR.get(x.erpId);
    return (
      !a || a.demo || a.clienteNome !== x.clienteNome || a.documento !== (x.documento ?? null) || !mesmaData(a.vencimento, x.vencimento) ||
      !mesmoNumero(a.valor, x.valor) || !mesmoNumero(a.valorPago, x.valorPago) || !mesmaData(a.pagoEm, x.pagoEm ?? null) || a.cancelado !== x.cancelado
    );
  });
  const payables = p.ok.filter((x) => {
    const a = atuaisP.get(x.erpId);
    return (
      !a || a.demo || a.fornecedor !== x.fornecedor || !mesmaData(a.vencimento, x.vencimento) || !mesmoNumero(a.valor, x.valor) ||
      !mesmoNumero(a.valorPago, x.valorPago) || !mesmaData(a.pagoEm, x.pagoEm ?? null) || a.cancelado !== x.cancelado
    );
  });

  // Ids em aberto só quando a lista veio inteira: lista pela metade fecharia
  // título que continua aberto.
  const idsAbertos = (lista: ContaApi[], mapear: typeof mapearReceber | typeof mapearPagar) =>
    lista.map((c) => mapear(c)).filter((c): c is NonNullable<typeof c> => !!c && !c.cancelado && !c.pagoEm).map((c) => c.erpId);
  const openReceivableIds = receber.abertos.completo ? idsAbertos(receber.abertos.itens, mapearReceber) : undefined;
  const openPayableIds = pagar.abertos.completo ? idsAbertos(pagar.abertos.itens, mapearPagar) : undefined;

  const maior = Math.max(receivables.length, payables.length);
  if (maior === 0 && (openReceivableIds || openPayableIds)) {
    await gravar({ openReceivableIds, openPayableIds });
  }
  for (let i = 0; i < maior; i += 5000) {
    const ultimo = i + 5000 >= maior;
    await gravar({
      receivables: receivables.slice(i, i + 5000),
      payables: payables.slice(i, i + 5000),
      ...(ultimo ? { openReceivableIds, openPayableIds } : {}),
    });
  }
  return { lidos, gravados: receivables.length + payables.length, recusados, avisos };
}

// Dias da loja do mais recente pro mais antigo: diasAtras(0, 2) = [hoje, ontem].
export function diasAtras(inicio: number, quantidade: number, agora = Date.now()): string[] {
  return Array.from({ length: quantidade }, (_, i) => diaLoja(-(inicio + i), agora));
}
