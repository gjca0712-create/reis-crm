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
    // Menor id de venda que ainda pode mudar (ver 2-sincronizar.js).
    pisoVendas: null,
    ultimaConferenciaCompleta: null,
  };
}

function carregarEstado() {
  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
    if (dados.versao !== VERSAO) return vazio();
    return { ...vazio(), ...dados };
  } catch {
    return vazio();
  }
}

// Grava num arquivo temporário e troca: se faltar luz no meio, o estado.json
// antigo continua inteiro.
function salvarEstado(estado) {
  const tmp = `${ARQUIVO}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(estado));
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
