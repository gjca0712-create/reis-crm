// Lê o .env que fica NA MESMA PASTA do programa (não na pasta de onde a tarefa
// agendada do Windows chamou o node) e confere o que é obrigatório.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

function obrigatorio(nome) {
  const valor = (process.env[nome] || "").trim();
  if (!valor) throw new Error(`Falta ${nome} no arquivo .env (veja o .env.exemplo).`);
  return valor;
}

function inteiro(nome, padrao) {
  const bruto = (process.env[nome] || "").trim();
  if (!bruto) return padrao;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${nome} no .env tem que ser um número inteiro (está "${bruto}").`);
  return n;
}

function carregarConfig({ precisaCrm = true } = {}) {
  const fuso = (process.env.FUSO || "-03:00").trim();
  if (!/^[+-]\d{2}:\d{2}$/.test(fuso)) throw new Error(`FUSO no .env tem que ser tipo -03:00 (está "${fuso}").`);

  const config = {
    mysql: {
      host: (process.env.MYSQL_HOST || "127.0.0.1").trim(),
      port: inteiro("MYSQL_PORT", 3306),
      user: obrigatorio("MYSQL_USUARIO"),
      password: process.env.MYSQL_SENHA || "",
      database: (process.env.MYSQL_BANCO || "orbitadb").trim(),
    },
    // Loja com mais de uma empresa no mesmo banco: só a desta. Vazio = todas.
    idEmpresa: inteiro("ID_EMPRESA", null),
    fuso,
    diasHistorico: inteiro("DIAS_HISTORICO", 365),
    crmUrl: null,
    chave: null,
  };

  if (precisaCrm) {
    config.crmUrl = obrigatorio("CRM_URL").replace(/\/+$/, "");
    if (!/^https:\/\//.test(config.crmUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(config.crmUrl)) {
      throw new Error("CRM_URL tem que começar com https:// (os dados vão pela internet).");
    }
    config.chave = obrigatorio("ERP_SYNC_KEY");
    if (config.chave.length < 32) throw new Error("ERP_SYNC_KEY tem que ter pelo menos 32 caracteres (a mesma do Railway).");
  }
  return config;
}

module.exports = { carregarConfig };
