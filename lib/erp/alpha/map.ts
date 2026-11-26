// Converte as respostas da API do AlphaDashboard pro contrato do espelho do
// ERP (lib/erp/sync.ts), o mesmo que o antigo programa da loja mandava. Assim
// as telas (Financeiro, Produtos) e o Consultor continuam lendo as mesmas
// tabelas Erp*, venha o dado de onde vier.
//
// Aqui só tem função pura (sem banco, sem rede): fácil de testar.

// Datas da API: "AAAA-MM-DD HH:MM:SS" no horário da loja, sem fuso. A Reis fica
// na Bahia (-03:00 o ano todo, sem horário de verão).
const FUSO_LOJA = "-03:00";

export function dataLojaParaIso(texto: unknown): string | null {
  if (typeof texto !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(texto.trim());
  if (!m) return null;
  const [, a, mes, d, h = "00", min = "00", s = "00"] = m;
  const iso = `${a}-${mes}-${d}T${h}:${min}:${s}${FUSO_LOJA}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

// A API devolve dinheiro e quantidade às vezes como número, às vezes como texto
// ("100.00"). Valor inválido vira null (quem chama decide: zero ou descartar).
export function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(String(valor).trim());
  return Number.isFinite(n) ? n : null;
}

function inteiro(valor: unknown): number | null {
  const n = numero(valor);
  return n !== null && Number.isInteger(n) && n >= -2_147_483_648 && n <= 2_147_483_647 ? n : null;
}

const texto = (valor: unknown, max: number): string | null => {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).replace(/\u0000/g, "").trim();
  return s ? s.slice(0, max) : null;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// ---------------------------------------------------------------------------
// Vendas (/vendas-dia)
// ---------------------------------------------------------------------------

// Situações que NÃO são venda (seção 7 da documentação da API). Ficam no
// espelho como canceladas: se a venda já tinha entrado como válida, sai dos
// totais; se depois for liberada, volta.
const SITUACOES_FORA = new Set(["cancelada", "cancelado", "excluida", "excluido", "em digitacao", "aguardando liberacao"]);

// Modelos que não entram no espelho:
// - ORC: orçamento não é venda;
// - 55: NF-e. O painel do próprio Órbita não conta (regra tirada do código
//   dele): a NF-e costuma ser emitida a partir de um DAV que já foi contado, e
//   contar os dois dobraria a venda. A API do AlphaDashboard conta o 55 — aqui
//   seguimos o Órbita.
export const MODELOS_FORA = new Set(["ORC", "55"]);

export type VendaApi = {
  id_saida_local?: unknown;
  data_emissao?: unknown;
  modelo?: unknown;
  valor_total?: unknown;
  valor_produtos?: unknown;
  valor_desconto?: unknown;
  situacao?: unknown;
  nome_vendedor?: unknown;
  nome_destinatario?: unknown;
};

export type VendaEspelho = {
  erpId: number;
  data: string;
  total: number;
  bruto: number;
  desconto: number;
  frete: number;
  modelo: string | null;
  vendedor: string | null;
  clienteCodigo: null;
  clienteNome: string | null;
  cancelada: boolean;
  items: never[];
  payments: never[];
};

export function mapearVenda(v: VendaApi): VendaEspelho | null {
  const erpId = inteiro(v.id_saida_local);
  const data = dataLojaParaIso(v.data_emissao);
  const total = numero(v.valor_total);
  if (erpId === null || !data || total === null) return null;
  const modelo = texto(v.modelo, 10);
  if (modelo && MODELOS_FORA.has(modelo.toUpperCase())) return null;
  const desconto = numero(v.valor_desconto) ?? 0;
  return {
    erpId,
    data,
    total,
    bruto: numero(v.valor_produtos) ?? total + desconto,
    desconto,
    frete: 0,
    modelo,
    vendedor: texto(v.nome_vendedor, 120),
    clienteCodigo: null,
    clienteNome: texto(v.nome_destinatario, 200),
    cancelada: SITUACOES_FORA.has(semAcento(String(v.situacao ?? ""))),
    // A API ainda não manda itens nem pagamentos por venda (pedido feito pra
    // Alpha): sem isso não há margem, mix de pagamento nem ranking por venda.
    items: [],
    payments: [],
  };
}

// ---------------------------------------------------------------------------
// Produtos (/estoque)
// ---------------------------------------------------------------------------

export type ProdutoApi = {
  codigo?: unknown;
  descricao?: unknown;
  estoque?: unknown;
  estoque_minimo?: unknown;
  preco_varejo?: unknown;
  custo_medio?: unknown;
  custo_manual?: unknown;
  grupo?: unknown;
};

export type ProdutoEspelho = {
  codigo: number;
  descricao: string;
  grupo: string | null;
  marca: string | null;
  unidade: string;
  precoVarejo: number;
  custo: number | null;
  estoque: number;
  estoqueMinimo: number | null;
  ativo: boolean;
  cadastradoEm: null;
};

export function mapearProduto(p: ProdutoApi): ProdutoEspelho | null {
  // O espelho usa produto.Codigo (número), o mesmo código que aparece nas vendas.
  const codigo = inteiro(typeof p.codigo === "string" ? p.codigo.trim() : p.codigo);
  const descricao = texto(p.descricao, 300);
  if (codigo === null || !descricao) return null;
  const medio = numero(p.custo_medio);
  const manual = numero(p.custo_manual);
  return {
    codigo,
    descricao,
    grupo: texto(p.grupo, 120),
    marca: null,
    unidade: "UN",
    precoVarejo: numero(p.preco_varejo) ?? 0,
    // Mesmo critério da API pro valor do estoque: custo médio, ou o manual quando não há médio.
    custo: medio && medio > 0 ? medio : manual && manual > 0 ? manual : null,
    estoque: numero(p.estoque) ?? 0,
    estoqueMinimo: numero(p.estoque_minimo),
    ativo: true,
    cadastradoEm: null,
  };
}

// ---------------------------------------------------------------------------
// Contas a receber / a pagar (/financeiro)
// ---------------------------------------------------------------------------

export type ContaApi = {
  id_local?: unknown;
  numero_documento?: unknown;
  descricao?: unknown;
  data_vencimento?: unknown;
  data_pagamento?: unknown;
  valor_documento?: unknown;
  valor_pagamento?: unknown;
  baixado?: unknown;
  cancelado?: unknown;
};

const verdadeiro = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

function camposConta(c: ContaApi) {
  const erpId = inteiro(c.id_local);
  const vencimento = dataLojaParaIso(c.data_vencimento);
  const valor = numero(c.valor_documento);
  if (erpId === null || !vencimento || valor === null) return null;
  const baixado = verdadeiro(c.baixado);
  // Baixado sem data de pagamento: usa o vencimento, senão o título apareceria
  // em aberto no CRM.
  const pagoEm = baixado ? dataLojaParaIso(c.data_pagamento) ?? vencimento : null;
  return {
    erpId,
    vencimento,
    valor,
    valorPago: numero(c.valor_pagamento) ?? (baixado ? valor : 0),
    pagoEm,
    cancelado: verdadeiro(c.cancelado),
    nome: texto(c.descricao, 200) ?? "Sem nome",
  };
}

export function mapearReceber(c: ContaApi) {
  const base = camposConta(c);
  if (!base) return null;
  const { nome, ...resto } = base;
  return {
    ...resto,
    clienteCodigo: null,
    clienteNome: nome,
    // A API ainda não manda o celular do cliente (pedido feito pra Alpha).
    clienteTelefone: null,
    documento: texto(c.numero_documento, 80),
  };
}

export function mapearPagar(c: ContaApi) {
  const base = camposConta(c);
  if (!base) return null;
  const { nome, ...resto } = base;
  return { ...resto, fornecedor: nome, categoria: null };
}

// ---------------------------------------------------------------------------
// Datas da loja pra consultar a API ("AAAA-MM-DD")
// ---------------------------------------------------------------------------

export function diaLoja(deslocamentoDias = 0, agora = Date.now()): string {
  // -03:00 fixo: meia-noite da loja = 03:00 UTC.
  const d = new Date(agora - 3 * 3_600_000 + deslocamentoDias * 86_400_000);
  return d.toISOString().slice(0, 10);
}
