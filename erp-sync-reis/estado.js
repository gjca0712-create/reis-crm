// O que já foi enviado pro CRM: uma "impressão digital" (hash) de cada
// registro. A cada ciclo só vai o que mudou — o Órbita não tem coluna de
// "atualizado em", então é comparando com o que foi mandado da última vez.
// Apagar o estado.json só faz o próximo ciclo reenviar tudo (o CRM grava por
// id do ERP, reenviar não duplica).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ARQUIVO = path.join(__dirname, "estado.json");
const VERSAO = 1;

function vazio() {
  return {
    versao: VERSAO,
    produtos: {}, // codigo -> hash
    vendas: {}, // idsaidanota -> hash
    receber: {}, // idrecebimento -> hash (só títulos em aberto)
    pagar: {}, // idpagamento -> hash (só títulos em aberto)
    // Próximo id de venda ainda não lido (ver 2-sincronizar.js).
    pisoVendas: null,
    // Vendas com id abaixo do piso que ainda podem mudar (em andamento ou
    // emitidas há poucos dias): relidas pelo id todo ciclo.
    vendasAcompanhar: [],
    ultimaConferenciaCompleta: null,
    // Início da última rodada (deu certo ou não): a tarefa de minuto em minuto
    // usa pra saber se já está na hora da próxima.
    ultimaRodada: null,
  };
}

// Sem estado.json = primeira vez (ou apagado): começa do zero. Arquivo
// estragado (luz que caiu no meio da gravação) vai pro lado como
// estado.json.estragado e também começa do zero. Qualquer outro erro de
// leitura (antivírus segurando o arquivo...) para a rodada: começar do zero à
// toa reenviaria tudo.
function carregarEstado({ avisar = () => {} } = {}) {
  let texto;
  try {
    texto = fs.readFileSync(ARQUIVO, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return vazio();
    throw new Error(`Não consegui ler o estado.json (${err.code || err.message}) — tento de novo na próxima rodada.`);
  }
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    fs.renameSync(ARQUIVO, `${ARQUIVO}.estragado`);
    avisar("estado.json estava estragado (guardado como estado.json.estragado): esta rodada manda tudo de novo, sem duplicar no CRM.");
    return vazio();
  }
  if (dados.versao !== VERSAO) return vazio();
  return { ...vazio(), ...dados };
}

// Grava num arquivo temporário, força pro disco e só então troca: se faltar
// luz no meio, o estado.json antigo continua inteiro.
function salvarEstado(estado) {
  const tmp = `${ARQUIVO}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, JSON.stringify(estado));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, ARQUIVO);
}

// Só os campos que vão pro CRM (os que começam com "_" são de uso interno).
function paraEnvio(registro) {
  const limpo = {};
  for (const [k, v] of Object.entries(registro)) if (!k.startsWith("_")) limpo[k] = v;
  return limpo;
}

function impressao(registro) {
  return crypto.createHash("sha1").update(JSON.stringify(paraEnvio(registro))).digest("hex").slice(0, 16);
}

module.exports = { carregarEstado, salvarEstado, estadoVazio: vazio, impressao, paraEnvio, ARQUIVO };
