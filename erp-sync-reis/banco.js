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
  await conexao.query("SET SESSION TRANSACTION READ ONLY");
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
