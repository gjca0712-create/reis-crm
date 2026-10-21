// Lê o Órbita e monta os registros no formato que o CRM espera (contrato em
// lib/erp/sync.ts do CRM). Regras tiradas do próprio Órbita:
// - Venda válida = a do painel de vendas do Órbita (uscDashboardVendas):
//   Cancelada = 0, Excluida = 0, Liberada = 1, Modelo diferente de "ORC"
//   (orçamento) e de "55" (a NF-e sai de um DAV que já foi contado).
// - Custo = último customedio do produto; se for 0, o CustoManual do cadastro
//   (mesma regra do painel do Órbita). No item da venda, o customedio vigente na
//   DATA da venda.
// - Estoque = SUM(estoque.Saldo) — produto.Estoque é campo morto no Órbita.
// - Cliente/fornecedor: CodigoCliente/CodigoFornecedor apontam pro campo
//   Codigo do cadastro (não pro id).
// - Título em aberto = Baixado = 0, Cancelado = 0, Excluido = 0.
// Tabelas pequenas (grupo, marca, cliente...) são lidas inteiras e cruzadas
// aqui: o Órbita não tem índice nesses Codigo, e join/subconsulta sem índice
// pesa no computador da loja.
const { paraIso } = require("./datas");

const MAX_ITENS_POR_VENDA = 1000; // limite do CRM
const MAX_PAGAMENTOS_POR_VENDA = 50;

function texto(valor, max) {
  if (valor == null) return null;
  const s = String(valor).replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}
function num(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}
function arred(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}
// Flag int do Órbita (0/1). NULL não é 0: o SQL do Órbita ("Cancelada = 0")
// descarta NULL, aqui também.
const ehZero = (v) => v !== null && v !== undefined && Number(v) === 0;
const ehUm = (v) => v !== null && v !== undefined && Number(v) === 1;
const ligado = (v) => v !== null && v !== undefined && Number(v) !== 0;

function filtroEmpresa(config, coluna) {
  return config.idEmpresa == null ? { sql: "", params: [] } : { sql: ` AND ${coluna} = ?`, params: [config.idEmpresa] };
}

// Codigo -> descrição, preferindo a linha não excluída quando o Codigo repete.
async function mapaDescricao(db, tabela) {
  const linhas = await db.query(`SELECT Codigo, Descricao, Excluido FROM ${tabela} ORDER BY Excluido, Codigo`);
  const mapa = new Map();
  for (const l of linhas) if (!mapa.has(l.Codigo)) mapa.set(l.Codigo, texto(l.Descricao, 120));
  return mapa;
}

// ---------------------------------------------------------------- cadastros

// De qual forma de pagamento sai o troco, da mais provável pra menos: a que
// permite troco no cadastro, a que se chama "dinheiro" e, por último, a de
// TratamentoEspecifico "Dinheiro" — que é o padrão da coluna, então muita forma
// que não é dinheiro também tem. 0 = nunca dá troco.
function prioridadeTroco(tipo, descricao) {
  if (ligado(tipo.PermiteTroco)) return 3;
  if (/dinheiro/i.test(descricao || "")) return 2;
  if (/dinheiro/i.test(tipo.TratamentoEspecifico || "")) return 1;
  return 0;
}

async function lerCadastros(db) {
  const clientes = new Map();
  for (const c of await db.query(
    `SELECT c.Codigo, c.NomeOuRazao, c.NomeFantasia, c.Excluido, ct.Celular, ct.Telefone
     FROM cliente c LEFT JOIN contato ct ON ct.idcontato = c.idcontato
     ORDER BY c.Excluido, c.Codigo`
  )) {
    if (clientes.has(c.Codigo)) continue;
    clientes.set(c.Codigo, {
      nome: texto(c.NomeOuRazao, 200) || texto(c.NomeFantasia, 200),
      telefone: texto(c.Celular, 30) || texto(c.Telefone, 30),
    });
  }

  const fornecedores = new Map();
  for (const f of await db.query(
    "SELECT Codigo, NomeFantasia, NomeOuRazao, Excluido FROM fornecedor WHERE Codigo IS NOT NULL ORDER BY Excluido, Codigo"
  )) {
    if (!fornecedores.has(f.Codigo)) fornecedores.set(f.Codigo, texto(f.NomeFantasia, 200) || texto(f.NomeOuRazao, 200));
  }

  const vendedores = new Map();
  for (const v of await db.query("SELECT CodigoVendedor, Nome FROM vendedor")) vendedores.set(String(v.CodigoVendedor), texto(v.Nome, 120));

  const usuarios = new Map();
  for (const u of await db.query("SELECT idusuario, Nome FROM usuario")) usuarios.set(u.idusuario, texto(u.Nome, 120));

  const tipos = new Map();
  for (const t of await db.query(
    "SELECT idtipoDocumento, Descricao, PermiteTroco, TratamentoEspecifico FROM tipodocumento"
  )) {
    const descricao = texto(t.Descricao, 80);
    tipos.set(t.idtipoDocumento, { descricao, troco: prioridadeTroco(t, descricao) });
  }

  const categorias = new Map();
  for (const p of await db.query("SELECT Id, Descricao FROM pc3")) categorias.set(p.Id, texto(p.Descricao, 120));

  return { clientes, fornecedores, vendedores, usuarios, tipos, categorias };
}

// ---------------------------------------------------------------- produtos

async function lerProdutos(db, config) {
  const [grupos, marcas, unidades] = [
    await mapaDescricao(db, "grupo"),
    await mapaDescricao(db, "marca"),
    await mapaDescricao(db, "unidademedida"),
  ];

  const empE = filtroEmpresa(config, "IdEmpresa");
  const saldos = new Map();
  for (const s of await db.query(
    `SELECT CodigoProduto, SUM(Saldo) AS Saldo FROM estoque WHERE CodigoProduto IS NOT NULL${empE.sql} GROUP BY CodigoProduto`,
    empE.params
  )) {
    saldos.set(s.CodigoProduto, num(s.Saldo));
  }

  // Igual ao painel do Órbita: a linha mais nova (maior id) de cada produto.
  const empC = filtroEmpresa(config, "IdEmpresa");
  const ultimoCusto = new Map();
  for (const c of await db.query(
    `SELECT c.CodigoProduto, c.Valor
     FROM customedio c
     JOIN (SELECT MAX(idcustomedio) AS id FROM customedio WHERE 1 = 1${empC.sql} GROUP BY CodigoProduto) u
       ON u.id = c.idcustomedio`,
    empC.params
  )) {
    ultimoCusto.set(c.CodigoProduto, num(c.Valor));
  }

  const linhas = await db.query(
    `SELECT Codigo, Descricao, Ativo, Excluido, PrecoVarejo, EstoqueMinimo, CustoManual, DataCadastro,
            CodigoGrupo, CodigoMarca, CodigoUnidadeMedida
     FROM produto ORDER BY Codigo`
  );

  const produtos = [];
  const custoManual = new Map(); // pro custo dos itens de venda (lerVendas)
  for (const p of linhas) {
    const manual = num(p.CustoManual);
    if (manual > 0) custoManual.set(p.Codigo, manual);
    const medio = ultimoCusto.get(p.Codigo) ?? 0;
    const custo = medio > 0 ? medio : manual > 0 ? manual : null;
    const minimo = num(p.EstoqueMinimo);
    produtos.push({
      codigo: p.Codigo,
      descricao: texto(p.Descricao, 300) || `Produto ${p.Codigo}`,
      grupo: grupos.get(p.CodigoGrupo) ?? null,
      marca: marcas.get(p.CodigoMarca) ?? null,
      unidade: (unidades.get(p.CodigoUnidadeMedida) || "UN").slice(0, 10),
      precoVarejo: arred(num(p.PrecoVarejo), 2),
      custo: custo == null ? null : arred(custo, 4),
      estoque: arred(saldos.get(p.Codigo) ?? 0, 3),
      estoqueMinimo: minimo > 0 ? arred(minimo, 3) : null,
      ativo: ehUm(p.Ativo) && ehZero(p.Excluido),
      cadastradoEm: paraIso(p.DataCadastro, config.fuso),
      // Só pro programa (não vai pro CRM): produto excluído que nunca foi
      // enviado não precisa ir.
      _excluido: ligado(p.Excluido),
    });
  }
  return { produtos, custoManual };
}

// ---------------------------------------------------------------- vendas

const COLUNAS_VENDA = `idsaidanota, DataEmissao, DataLancamento, vNF, vProd, vDesc, vFrete, vTroco, Modelo,
  Cancelada, Excluida, Liberada, NomeVendedor, CodigoVendedor, CodigoCliente, xNome, idusuario`;

// Ciclo normal: pelo id (chave primária, sequencial). saidanota não tem índice
// em DataEmissao — filtrar por data varre a tabela inteira.
async function lerCabecalhosDesdeId(db, config, desdeId) {
  const emp = filtroEmpresa(config, "IdEmpresa");
  return db.query(
    `SELECT ${COLUNAS_VENDA} FROM saidanota WHERE idsaidanota >= ?${emp.sql} ORDER BY idsaidanota`,
    [desdeId, ...emp.params]
  );
}

// Conferência completa (uma vez por dia): varre por data. Também traz venda em
// andamento lançada nos últimos dias, que ainda não tem DataEmissao.
async function lerCabecalhosDesdeData(db, config, desdeEmissao, desdeLancamento) {
  const emp = filtroEmpresa(config, "IdEmpresa");
  return db.query(
    `SELECT ${COLUNAS_VENDA} FROM saidanota
     WHERE (DataEmissao >= ? OR DataLancamento >= ?)${emp.sql}
     ORDER BY idsaidanota`,
    [desdeEmissao, desdeLancamento, ...emp.params]
  );
}

// Releitura pelo id das vendas que o programa acompanha (ver 2-sincronizar.js).
async function lerCabecalhosPorId(db, ids) {
  return db.queryEmPartes(`SELECT ${COLUNAS_VENDA} FROM saidanota WHERE idsaidanota IN (?)`, ids);
}

async function maiorIdVenda(db) {
  const [linha] = await db.query("SELECT MAX(idsaidanota) AS id FROM saidanota");
  return num(linha?.id);
}

function modeloQueConta(s) {
  const modelo = String(s.Modelo ?? "").trim().toUpperCase();
  return modelo !== "" && modelo !== "ORC" && modelo !== "55";
}

function vendaValida(s) {
  return ehZero(s.Cancelada) && ehZero(s.Excluida) && ehUm(s.Liberada) && modeloQueConta(s) && !!s.DataEmissao;
}

// Emitida e depois cancelada/excluída: pode estar no CRM como válida se o
// programa perdeu o estado.json — a conferência completa manda como cancelada.
function vendaDesfeita(s) {
  return (ligado(s.Cancelada) || ligado(s.Excluida)) && modeloQueConta(s) && !!s.DataEmissao;
}

// Ainda sendo digitada/paga no caixa — pode virar venda daqui a pouco.
function vendaEmAndamento(s) {
  return ehZero(s.Cancelada) && ehZero(s.Excluida) && !ehUm(s.Liberada);
}

// Último custo com data <= a data da venda. `linhas` em ordem de data.
function custoNaData(linhas, data) {
  if (!linhas) return null;
  let ini = 0;
  let fim = linhas.length - 1;
  let achado = -1;
  while (ini <= fim) {
    const meio = (ini + fim) >> 1;
    if (linhas[meio].data <= data) {
      achado = meio;
      ini = meio + 1;
    } else fim = meio - 1;
  }
  return achado < 0 ? null : linhas[achado].valor;
}

// Monta as vendas (cabeçalho + itens + pagamentos) dos cabeçalhos dados.
// `cancelada: true` pra quem deixou de valer (cancelada/excluída depois de
// enviada) — o CRM mantém e tira dos totais.
async function montarVendas(db, config, cabecalhos, { cadastros, custoManual, avisar }) {
  if (!cabecalhos.length) return [];
  const ids = cabecalhos.map((s) => s.idsaidanota);

  const itensPorVenda = new Map();
  for (const i of await db.queryEmPartes(
    `SELECT IdSaida, Codigo, Descricao, Quantidade, ValorUnitario, SubTotal, Desconto, DescontoRateado,
            AcrescimoRateado, OutrasDespesas
     FROM saidaitem WHERE IdSaida IN (?) ORDER BY IdSaida, idsaidaitem`,
    ids
  )) {
    if (!itensPorVenda.has(i.IdSaida)) itensPorVenda.set(i.IdSaida, []);
    itensPorVenda.get(i.IdSaida).push(i);
  }

  const pagamentosPorVenda = new Map();
  for (const p of await db.queryEmPartes(
    `SELECT idvenda, Valor, DescricaoPagamento, idtipoDocumento
     FROM pagamentovenda WHERE idvenda IN (?) ORDER BY idvenda, idPagamentoVenda`,
    ids
  )) {
    if (!pagamentosPorVenda.has(p.idvenda)) pagamentosPorVenda.set(p.idvenda, []);
    pagamentosPorVenda.get(p.idvenda).push(p);
  }

  // Histórico de custo só dos produtos que aparecem nessas vendas (índice em
  // CodigoProduto).
  const codigos = [...new Set([...itensPorVenda.values()].flat().map((i) => i.Codigo))];
  const custos = new Map();
  const emp = config.idEmpresa == null ? "" : "IdEmpresa = ? AND ";
  for (const c of await db.queryEmPartes(
    `SELECT CodigoProduto, DataMovimentacao, Valor FROM customedio
     WHERE ${emp}CodigoProduto IN (?) ORDER BY CodigoProduto, DataMovimentacao, idcustomedio`,
    codigos,
    1000,
    config.idEmpresa == null ? [] : [config.idEmpresa]
  )) {
    if (!c.DataMovimentacao) continue;
    if (!custos.has(c.CodigoProduto)) custos.set(c.CodigoProduto, []);
    custos.get(c.CodigoProduto).push({ data: c.DataMovimentacao, valor: num(c.Valor) });
  }

  const vendas = [];
  for (const s of cabecalhos) {
    const data = paraIso(s.DataEmissao, config.fuso) || paraIso(s.DataLancamento, config.fuso);
    if (!data) {
      avisar(`venda ${s.idsaidanota} sem data — fica de fora`);
      continue;
    }

    let itens = (itensPorVenda.get(s.idsaidanota) || []).map((i) => {
      const quantidade = num(i.Quantidade);
      const subtotal = i.SubTotal != null ? num(i.SubTotal) : num(i.ValorUnitario) * quantidade;
      // O ValorTotal do Órbita às vezes tira o desconto rateado da venda, às
      // vezes não (depende da tela que gravou) — recalcula pelas partes.
      const liquido =
        subtotal - num(i.Desconto) - num(i.DescontoRateado) + num(i.AcrescimoRateado) + num(i.OutrasDespesas);
      const medio = custoNaData(custos.get(i.Codigo), s.DataEmissao || s.DataLancamento);
      const custo = medio != null && medio > 0 ? medio : custoManual.get(i.Codigo) ?? null;
      return {
        produtoCodigo: i.Codigo,
        descricao: texto(i.Descricao, 300) || `Produto ${i.Codigo}`,
        quantidade: arred(quantidade, 4),
        valorTotal: arred(liquido, 2),
        custoUnitario: custo == null ? null : arred(custo, 4),
      };
    });
    if (itens.length > MAX_ITENS_POR_VENDA) {
      avisar(`venda ${s.idsaidanota} tem ${itens.length} itens — vão só os ${MAX_ITENS_POR_VENDA} primeiros`);
      itens = itens.slice(0, MAX_ITENS_POR_VENDA);
    }

    // Pagamentos somados por forma. Troco: se o que foi pago passa do total
    // da nota, o excesso sai da forma que dá troco (prioridadeTroco).
    const formas = new Map();
    for (const p of pagamentosPorVenda.get(s.idsaidanota) || []) {
      const tipo = cadastros.tipos.get(p.idtipoDocumento);
      const forma = tipo?.descricao || texto(p.DescricaoPagamento, 80) || "Outros";
      const atual = formas.get(forma) || { valor: 0, troco: 0 };
      atual.valor += num(p.Valor);
      atual.troco = Math.max(atual.troco, tipo?.troco ?? 0, /dinheiro/i.test(forma) ? 2 : 0);
      formas.set(forma, atual);
    }
    const pago = [...formas.values()].reduce((t, f) => t + f.valor, 0);
    let sobra = Math.min(num(s.vTroco), pago - num(s.vNF));
    if (sobra > 0.004) {
      for (const f of [...formas.values()].sort((a, b) => b.troco - a.troco)) {
        if (!f.troco || sobra <= 0) continue;
        const tira = Math.min(f.valor, sobra);
        f.valor -= tira;
        sobra -= tira;
      }
    }
    const pagamentos = [...formas.entries()]
      .map(([forma, f]) => ({ forma, valor: arred(f.valor, 2) }))
      .filter((p) => p.valor !== 0)
      .slice(0, MAX_PAGAMENTOS_POR_VENDA);

    const cliente = num(s.CodigoCliente) > 0 ? cadastros.clientes.get(s.CodigoCliente) : null;
    vendas.push({
      erpId: s.idsaidanota,
      data,
      total: arred(num(s.vNF), 2),
      bruto: arred(num(s.vProd), 2),
      desconto: arred(num(s.vDesc), 2),
      frete: arred(num(s.vFrete), 2),
      modelo: texto(s.Modelo, 10),
      vendedor:
        texto(s.NomeVendedor, 120) ||
        cadastros.vendedores.get(String(s.CodigoVendedor ?? "").trim()) ||
        cadastros.usuarios.get(s.idusuario) ||
        null,
      clienteCodigo: num(s.CodigoCliente) > 0 ? s.CodigoCliente : null,
      clienteNome: cliente?.nome || texto(s.xNome, 200),
      cancelada: !vendaValida(s),
      items: itens,
      payments: pagamentos,
    });
  }
  return vendas;
}

// ---------------------------------------------------------------- títulos

const COLUNAS_RECEBER = `idrecebimento AS id, CodigoCliente, DataVencimento, DataDocumento, DataLancamento,
  ValorDocumento, ValorOriginal, ValorPagamento, DataPagamento, Baixado, Cancelado, Excluido, Parcial, idtipoDocumento`;
const COLUNAS_PAGAR = `idpagamento AS id, CodigoFornecedor, Descricao, IdPc3, DataVencimento, DataDocumento,
  DataLancamento, ValorDocumento, ValorPagamento, DataPagamento, Baixado, Cancelado, Excluido, Parcial`;

const tituloEmAberto = (t) => ehZero(t.Baixado) && ehZero(t.Cancelado) && ehZero(t.Excluido);

// Em aberto agora + os que estavam em aberto da última vez (pra mandar o
// estado final: pago, cancelado...).
async function lerTitulos(db, tabela, colunaId, colunas, idsAntes) {
  const abertos = await db.query(
    `SELECT ${colunas} FROM ${tabela} WHERE Baixado = 0 AND Cancelado = 0 AND Excluido = 0`
  );
  const vistos = new Set(abertos.map((t) => t.id));
  const faltam = idsAntes.filter((id) => !vistos.has(id));
  const fechados = await db.queryEmPartes(`SELECT ${colunas} FROM ${tabela} WHERE ${colunaId} IN (?)`, faltam);
  return [...abertos, ...fechados];
}

function montarTituloBase(t, config, agoraIso) {
  const vencimento =
    paraIso(t.DataVencimento, config.fuso) || paraIso(t.DataDocumento, config.fuso) || paraIso(t.DataLancamento, config.fuso);
  if (!vencimento) return null;
  const baixado = ligado(t.Baixado);
  const valor = t.ValorDocumento != null ? num(t.ValorDocumento) : num(t.ValorOriginal);
  // Em aberto com baixa parcial (Parcial = 1): o que já entrou abate do saldo.
  // Sem essa marca, ValorPagamento de título em aberto não conta: não dá pra
  // saber se é pagamento de verdade, e contar errado esconderia uma dívida.
  const jaPago = num(t.ValorPagamento);
  const parcial = !baixado && ligado(t.Parcial) && jaPago > 0 && jaPago < valor;
  return {
    erpId: t.id,
    vencimento,
    valor: arred(valor, 2),
    valorPago: baixado ? arred(t.ValorPagamento != null ? jaPago : valor, 2) : parcial ? arred(jaPago, 2) : 0,
    pagoEm: baixado ? paraIso(t.DataPagamento, config.fuso) || agoraIso : null,
    cancelado: ligado(t.Cancelado) || ligado(t.Excluido),
  };
}

async function lerContasReceber(db, config, idsAbertosAntes, { cadastros, agoraIso, avisar }) {
  const linhas = await lerTitulos(db, "recebimento", "idrecebimento", COLUNAS_RECEBER, idsAbertosAntes);
  const titulos = [];
  for (const t of linhas) {
    const base = montarTituloBase(t, config, agoraIso);
    if (!base) {
      avisar(`conta a receber ${t.id} sem vencimento — fica de fora`);
      continue;
    }
    const codigo = num(t.CodigoCliente) > 0 ? t.CodigoCliente : null;
    const cliente = codigo ? cadastros.clientes.get(codigo) : null;
    titulos.push({
      ...base,
      clienteCodigo: codigo,
      clienteNome: cliente?.nome || (codigo ? `Cliente ${codigo}` : "Cliente não informado"),
      clienteTelefone: cliente?.telefone ?? null,
      documento: cadastros.tipos.get(t.idtipoDocumento)?.descricao ?? null,
      _aberto: tituloEmAberto(t),
    });
  }
  return titulos;
}

async function lerContasPagar(db, config, idsAbertosAntes, { cadastros, agoraIso, avisar }) {
  const linhas = await lerTitulos(db, "pagamento", "idpagamento", COLUNAS_PAGAR, idsAbertosAntes);
  const titulos = [];
  for (const t of linhas) {
    const base = montarTituloBase(t, config, agoraIso);
    if (!base) {
      avisar(`conta a pagar ${t.id} sem vencimento — fica de fora`);
      continue;
    }
    const codigo = num(t.CodigoFornecedor) > 0 ? t.CodigoFornecedor : null;
    titulos.push({
      ...base,
      fornecedor: (codigo && cadastros.fornecedores.get(codigo)) || texto(t.Descricao, 200) || "Fornecedor não informado",
      categoria: cadastros.categorias.get(t.IdPc3) ?? null,
      _aberto: tituloEmAberto(t),
    });
  }
  return titulos;
}

module.exports = {
  lerCadastros,
  lerProdutos,
  lerCabecalhosDesdeId,
  lerCabecalhosDesdeData,
  lerCabecalhosPorId,
  maiorIdVenda,
  montarVendas,
  lerContasReceber,
  lerContasPagar,
  vendaValida,
  vendaDesfeita,
  vendaEmAndamento,
  prioridadeTroco,
  custoNaData,
};
