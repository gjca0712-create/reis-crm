// Sincroniza o Órbita (MySQL deste computador, só leitura) com o CRM.
// Roda pela tarefa agendada do Windows a cada minuto (LEIA-ME.md).
//
//   node 2-sincronizar.js             ciclo normal agora: manda só o que mudou
//   node 2-sincronizar.js --agendado  o que a tarefa chama: só roda se alguém
//                                     apertou "Atualizar agora" no CRM ou se já
//                                     deu MINUTOS_ENTRE_ENVIOS desde a última
//   node 2-sincronizar.js --simular   lê tudo e mostra o que mandaria, sem mandar
//   node 2-sincronizar.js --tudo      esquece o que já mandou e manda tudo de novo
//
// Como acha o que mudou (o Órbita não tem "atualizado em"):
// - Produtos e títulos em aberto: lidos inteiros todo ciclo e comparados com o
//   que foi mandado da última vez (estado.json).
// - Vendas: cada ciclo lê as novas (id a partir do "piso", que anda até o fim
//   da tabela) e relê pelo id as que ainda podem mudar: emitidas nos últimos 3
//   dias (podem ser canceladas) e em andamento lançadas nos últimos 90 (DAV que
//   ainda vai ser faturado). Uma vez por dia, a conferência completa relê o
//   histórico inteiro por data: pega cancelamento de venda antiga.
// - Na conferência completa vai também a lista dos títulos em aberto: o CRM
//   tira da conta o que não está nela e devolve os ids, que o ciclo seguinte
//   relê e manda como estão. Vão também, uma vez, os produtos excluídos e as
//   vendas desfeitas que o programa não conhece. As duas coisas cobrem o
//   estado.json perdido.
// - Todo ciclo fala com o CRM pelo menos uma vez, mesmo sem nada novo: é assim
//   que a tela mostra "atualizado há X min" e dá pra ver se o programa parou.
const { carregarConfig } = require("./config");
const { conectar } = require("./banco");
const orbita = require("./orbita");
const { carregarEstado, salvarEstado, estadoVazio, impressao, paraEnvio } = require("./estado");
const { postar, enviarEmLotes, consultarPedido, ErroFatal } = require("./crm");
const { horarioLojaMenosDias, paraIso } = require("./datas");
const { abrirLog } = require("./log");
const { travar } = require("./trava");

const DIAS_REENVIO = 3;
const DIAS_EM_ANDAMENTO = 90;
const HORAS_ENTRE_CONFERENCIAS = 20;
// O piso fica um pouco antes do fim da tabela: venda gravada no Órbita durante
// a leitura, com id menor que o último, entra no ciclo seguinte.
const MARGEM_IDS = 50;
const LOTE = { products: 2000, sales: 300, receivables: 2000, payables: 2000 };
const VENDAS_POR_LEITURA = 900;
const NOMES = { products: "produto", sales: "venda", receivables: "conta a receber", payables: "conta a pagar" };

// pedido: a hora do "Atualizar agora" que esta rodada atende (ou null) — vai de
// volta no último POST, e a tela do CRM recarrega quando ele chega.
// progresso: andamento de envio grande (só na tela, quando roda na mão).
async function sincronizar({
  config,
  db,
  estado,
  log,
  simular = false,
  tudo = false,
  pedido = null,
  agora = Date.now(),
  salvar = salvarEstado,
  progresso = () => {},
}) {
  const quando = (dias) => horarioLojaMenosDias(dias, config.fuso, agora);
  const agoraIso = paraIso(quando(0), config.fuso);
  const avisar = (m) => log.aviso(m);
  const resumo = { products: 0, sales: 0, receivables: 0, payables: 0, recusados: 0, completa: false };
  let falouComCrm = false;

  let ultimoSalvo = 0;
  const salvarDeVezEmQuando = () => {
    if (Date.now() - ultimoSalvo < 10_000) return;
    salvar(estado);
    ultimoSalvo = Date.now();
  };

  async function enviar(tipo, itens, aoGravar) {
    if (!itens.length) return;
    if (simular) {
      resumo[tipo] += itens.length;
      return;
    }
    let enviados = 0;
    await enviarEmLotes(config, tipo, itens, LOTE[tipo], {
      aoEnviar: async (lote) => {
        falouComCrm = true;
        for (const x of lote) aoGravar(x);
        resumo[tipo] += lote.length;
        enviados += lote.length;
        if (itens.length > LOTE[tipo]) progresso(`  ${NOMES[tipo]}: ${enviados} de ${itens.length}`);
        salvarDeVezEmQuando();
      },
      // Fica de fora, mas marcado: não tenta de novo a cada ciclo, só quando
      // o registro mudar no Órbita.
      aoRecusar: async (x, motivo) => {
        falouComCrm = true;
        resumo.recusados++;
        log.aviso(`${NOMES[tipo]} ${x.chave} recusado pelo CRM — ${motivo}`);
        aoGravar(x);
        salvarDeVezEmQuando();
      },
    });
  }

  // Conferência completa: uma vez por dia, na primeira rodada e com --tudo.
  // Nunca na rodada do "Atualizar agora", que tem que ser rápida.
  const ultimaCompleta = estado.ultimaConferenciaCompleta ? Date.parse(estado.ultimaConferenciaCompleta) : 0;
  const completa =
    tudo || estado.pisoVendas == null || (!pedido && agora - ultimaCompleta >= HORAS_ENTRE_CONFERENCIAS * 3_600_000);
  resumo.completa = completa;

  const cadastros = await orbita.lerCadastros(db);

  // ---- produtos
  const { produtos, custoManual } = await orbita.lerProdutos(db, config);
  const produtosMudados = [];
  for (const p of produtos) {
    const antes = estado.produtos[p.codigo];
    // Excluído no Órbita que o programa nunca mandou: só vai na conferência
    // completa, uma vez (se o estado.json se perdeu, o CRM pode ter ele ativo).
    if (p._excluido && antes === undefined && !completa) continue;
    const hash = impressao(p);
    if (antes !== hash) produtosMudados.push({ chave: p.codigo, hash, envio: paraEnvio(p) });
  }
  await enviar("products", produtosMudados, (x) => {
    estado.produtos[x.chave] = x.hash;
  });

  // ---- vendas
  const limiteHistorico = quando(config.diasHistorico);
  const limiteReenvio = quando(DIAS_REENVIO);
  const limiteAndamento = quando(DIAS_EM_ANDAMENTO);
  const amanha = quando(-1);

  // Lido antes das vendas: o que for gravado durante a leitura fica pro
  // próximo ciclo.
  const teto = await orbita.maiorIdVenda(db);
  let cabecalhos;
  if (completa) {
    cabecalhos = await orbita.lerCabecalhosDesdeData(db, config, limiteHistorico, limiteAndamento);
  } else {
    cabecalhos = await orbita.lerCabecalhosDesdeId(db, config, estado.pisoVendas);
    const lidas = new Set(cabecalhos.map((s) => s.idsaidanota));
    const faltam = estado.vendasAcompanhar.filter((id) => !lidas.has(id));
    if (faltam.length) cabecalhos = cabecalhos.concat(await orbita.lerCabecalhosPorId(db, faltam));
  }

  // Relidas pelo id no próximo ciclo: emitida há poucos dias (pode ser
  // cancelada) ou em andamento (pode ser faturada). Emissão com data no futuro
  // é erro de digitação e não fica presa na lista.
  const acompanhar = [];
  for (const s of cabecalhos) {
    const recente = !!s.DataEmissao && s.DataEmissao >= limiteReenvio && s.DataEmissao <= amanha;
    const andamento = orbita.vendaEmAndamento(s) && (s.DataLancamento || s.DataEmissao || "") >= limiteAndamento;
    if (recente || andamento) acompanhar.push(s.idsaidanota);
  }

  // Vai pro CRM: válida dentro do histórico, ou já mandada antes (pode ter
  // sido cancelada). Na conferência completa vai também, uma vez, a emitida e
  // depois desfeita que o programa não conhece: se o estado.json se perdeu, o
  // CRM pode ter ela como válida.
  const relevantes = cabecalhos.filter(
    (s) =>
      (s.DataEmissao >= limiteHistorico && (orbita.vendaValida(s) || (completa && orbita.vendaDesfeita(s)))) ||
      estado.vendas[s.idsaidanota] !== undefined
  );
  for (let i = 0; i < relevantes.length; i += VENDAS_POR_LEITURA) {
    if (relevantes.length > VENDAS_POR_LEITURA) {
      progresso(`  vendas: lendo ${i + 1} a ${Math.min(i + VENDAS_POR_LEITURA, relevantes.length)} de ${relevantes.length}`);
    }
    const vendas = await orbita.montarVendas(db, config, relevantes.slice(i, i + VENDAS_POR_LEITURA), {
      cadastros,
      custoManual,
      avisar,
    });
    const mudadas = [];
    for (const v of vendas) {
      const hash = impressao(v);
      if (estado.vendas[v.erpId] !== hash) mudadas.push({ chave: v.erpId, hash, envio: v });
    }
    await enviar("sales", mudadas, (x) => {
      estado.vendas[x.chave] = x.hash;
    });
  }

  // ---- contas a receber / a pagar
  const ctx = { cadastros, agoraIso, avisar };
  const receber = await orbita.lerContasReceber(db, config, Object.keys(estado.receber).map(Number), ctx);
  const pagar = await orbita.lerContasPagar(db, config, Object.keys(estado.pagar).map(Number), ctx);
  for (const [tipo, titulos, mapa] of [
    ["receivables", receber, estado.receber],
    ["payables", pagar, estado.pagar],
  ]) {
    // Sumiu do Órbita (linha apagada): não tem mais o que acompanhar.
    const lidos = new Set(titulos.map((t) => String(t.erpId)));
    for (const id of Object.keys(mapa)) if (!lidos.has(id)) delete mapa[id];
    const mudados = [];
    for (const t of titulos) {
      const antes = mapa[t.erpId];
      // Fechado (pago/cancelado) que o CRM nunca recebeu em aberto: não precisa ir.
      if (!t._aberto && antes === undefined) continue;
      const hash = impressao(t);
      if (antes !== hash) mudados.push({ chave: t.erpId, hash, aberto: t._aberto, envio: paraEnvio(t) });
    }
    // O estado guarda só os em aberto: fechado vai uma vez (pro CRM saber) e sai.
    await enviar(tipo, mudados, (x) => {
      if (x.aberto) mapa[x.chave] = x.hash;
      else delete mapa[x.chave];
    });
  }

  if (simular) return resumo;

  // ---- fechamento: só chega aqui se tudo acima foi gravado no CRM
  const fechamento = {};
  if (completa) {
    fechamento.openReceivableIds = receber.filter((t) => t._aberto).map((t) => t.erpId);
    fechamento.openPayableIds = pagar.filter((t) => t._aberto).map((t) => t.erpId);
  }
  if (pedido) fechamento.handledRequestAt = pedido;
  if (completa || !falouComCrm || pedido) {
    const r = await postar(config, fechamento);
    if (!r.ok) throw new Error(`CRM recusou o fechamento do ciclo (${r.status}): ${JSON.stringify(r.json).slice(0, 300)}`);
    // Estavam em aberto no CRM sem estar mais no Órbita (o CRM marcou como
    // cancelados): entram no estado sem impressão, e o próximo ciclo relê pelo
    // id e manda como estão de verdade (pago, cancelado...).
    let fechadosNoCrm = 0;
    for (const [ids, mapa] of [
      [r.json?.closedReceivableIds, estado.receber],
      [r.json?.closedPayableIds, estado.pagar],
    ]) {
      for (const id of ids || []) {
        mapa[id] = "";
        fechadosNoCrm++;
      }
    }
    if (fechadosNoCrm) log.info(`${fechadosNoCrm} títulos fecharam no Órbita sem o programa ver — vão como estão no próximo ciclo.`);
  }

  estado.pisoVendas = Math.max(1, teto + 1 - MARGEM_IDS);
  estado.vendasAcompanhar = acompanhar;
  if (completa) {
    // Venda que saiu do histórico não precisa mais ser acompanhada.
    const vistas = new Set(cabecalhos.map((s) => String(s.idsaidanota)));
    for (const id of Object.keys(estado.vendas)) if (!vistas.has(id)) delete estado.vendas[id];
    estado.ultimaConferenciaCompleta = new Date(agora).toISOString();
  }
  salvar(estado);
  return resumo;
}

// Pela tarefa (de minuto em minuto), sem pedido do CRM: já deu o intervalo
// desde o começo da última rodada? 30 s de folga pra 10 min não virar 11.
function horaDeRodar(estado, config, agora) {
  const ultima = estado.ultimaRodada ? Date.parse(estado.ultimaRodada) : 0;
  return agora - ultima >= config.minutosEntreEnvios * 60_000 - 30_000;
}

function mensagemDeErro(err, config) {
  if (err instanceof ErroFatal) return err.message;
  if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
    return `MySQL não respondeu em ${config?.mysql.host}:${config?.mysql.port} — o Órbita/MySQL está ligado neste computador?`;
  }
  if (err.code === "ER_ACCESS_DENIED_ERROR") return "MySQL recusou usuário/senha — confira MYSQL_USUARIO e MYSQL_SENHA no .env.";
  if (err.code === "ER_BAD_DB_ERROR") return `Banco "${config?.mysql.database}" não existe — confira MYSQL_BANCO no .env.`;
  if (err.code === "ER_TABLEACCESS_DENIED_ERROR") return `Usuário do MySQL sem permissão de leitura: ${err.message}`;
  if (err.name === "TimeoutError" || err.cause?.code === "ENOTFOUND" || err.cause?.code === "ECONNREFUSED") {
    return `Sem conexão com o CRM (${config?.crmUrl}) — internet fora? ${err.cause?.code || err.message}`;
  }
  return err.stack || String(err);
}

async function principal() {
  const args = new Set(process.argv.slice(2));
  const simular = args.has("--simular");
  const tudo = args.has("--tudo");
  const agendado = args.has("--agendado") && !simular && !tudo;
  const log = abrirLog();
  let config = null;
  let db = null;
  let soltar = null;
  let estado = null;
  const inicio = Date.now();
  try {
    config = carregarConfig({ precisaCrm: !simular });
    soltar = travar();
    if (!soltar) {
      // Pela tarefa isso acontece todo minuto durante uma rodada longa: sem log.
      if (!agendado) log.info("Outra sincronização ainda está rodando — esta fica pra próxima.");
      return;
    }
    estado = tudo ? estadoVazio() : carregarEstado({ avisar: (m) => log.aviso(m) });
    const pedido = simular ? null : await consultarPedido(config);
    if (agendado && !pedido && !horaDeRodar(estado, config, inicio)) return;
    if (!simular) estado.ultimaRodada = new Date(inicio).toISOString();
    db = await conectar(config);
    const progresso = agendado ? undefined : (m) => console.log(m);
    const r = await sincronizar({ config, db, estado, log, simular, tudo, pedido, progresso });
    const partes = `${r.products} produtos, ${r.sales} vendas, ${r.receivables} a receber, ${r.payables} a pagar`;
    const extra =
      `${r.recusados ? `, ${r.recusados} recusados (ver avisos)` : ""}` +
      `${r.completa ? " — conferência completa" : ""}${pedido ? " — pedido pelo CRM" : ""}`;
    const tempo = `${Math.round((Date.now() - inicio) / 1000)} s`;
    log.info(simular ? `SIMULAÇÃO, nada foi enviado. Mandaria: ${partes}${extra} (${tempo}).` : `OK: ${partes}${extra} (${tempo}).`);
  } catch (err) {
    log.erro(mensagemDeErro(err, config));
    // O que já foi gravado no CRM fica marcado: a próxima tentativa continua dali.
    if (estado && !simular) {
      try {
        salvarEstado(estado);
      } catch {
        // sem disco: a próxima reenvia, e o CRM não duplica
      }
    }
    process.exitCode = 1;
  } finally {
    if (db) await db.fechar().catch(() => {});
    if (soltar) soltar();
  }
}

if (require.main === module) principal();

module.exports = { sincronizar, horaDeRodar };
