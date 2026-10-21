// Conexão com o MySQL do Órbita. SÓ LEITURA, em duas camadas: o usuário do
// banco só tem SELECT (criar-usuario-leitura.sql) e a sessão é aberta em modo
// somente leitura — um engano no código não consegue gravar nada no ERP.
const mysql = require("mysql2/promise");

async function conectar(config) {
  const conexao = await mysql.createConnection({
    ...config.mysql,
    // Datas como texto ("2026-09-26 14:30:00"): o Órbita guarda horário da loja
    // sem fuso, e quem põe o fuso somos nós (datas.js). Assim o driver não
    // "converte" nada pelo fuso do Windows.
    dateStrings: true,
    decimalNumbers: true,
    charset: "utf8mb4",
    connectTimeout: 15_000,
  });
  try {
    await conexao.query("SET SESSION TRANSACTION READ ONLY");
  } catch (err) {
    // MySQL 5.5 não tem esse comando: fica só a camada do usuário com SELECT.
    if (err.code !== "ER_PARSE_ERROR") throw err;
  }
  // Nenhuma consulta passa de 5 min: se o banco travar, a rodada desiste em vez
  // de ficar pendurada pesando no computador. MySQL 5.7.8+ (milissegundos) e
  // MariaDB 10.1+ (segundos); quem não tem ignora.
  await conexao.query("SET SESSION MAX_EXECUTION_TIME = 300000").catch(() => {});
  await conexao.query("SET SESSION max_statement_time = 300").catch(() => {});
  return {
    async query(sql, params = []) {
      const [linhas] = await conexao.query(sql, params);
      return linhas;
    },
    // IN (...) com muitos ids, em pedaços — consulta gigante pesa no PC da loja.
    async queryEmPartes(sqlComIn, ids, tamanho = 1000, paramsAntes = []) {
      const todas = [];
      for (let i = 0; i < ids.length; i += tamanho) {
        const parte = ids.slice(i, i + tamanho);
        const [linhas] = await conexao.query(sqlComIn, [...paramsAntes, parte]);
        todas.push(...linhas);
      }
      return todas;
    },
    fechar: () => conexao.end(),
  };
}

module.exports = { conectar };
