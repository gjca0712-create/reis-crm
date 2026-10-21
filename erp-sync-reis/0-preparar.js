// Prepara este computador pra sincronização, numa rodada só:
//   1. cria no MySQL o usuário crm_leitura, que SÓ CONSEGUE CONSULTAR (SELECT),
//      com uma senha aleatória nova;
//   2. grava esse usuário e a senha no .env desta pasta (cria o .env a partir
//      do .env.exemplo se ainda não existir);
//   3. gera a chave do CRM (ERP_SYNC_KEY), se o .env ainda não tiver, e mostra
//      na tela pra colar no Railway.
//
//   node 0-preparar.js
//
// Pede um administrador do MySQL (root, ou o userdba do próprio Órbita) e a
// senha dele, uma vez. Ela não aparece na tela, não vai pro .env e não fica
// salva em lugar nenhum: só serve pra criar o usuário. Fora isso, nada no
// banco do Órbita é alterado.
// Rodar de novo é seguro: troca a senha do crm_leitura e atualiza o .env (a
// chave do CRM continua a mesma).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");
const dotenv = require("dotenv");

const ENV = path.join(__dirname, ".env");
const EXEMPLO = path.join(__dirname, ".env.exemplo");
const USUARIO = "crm_leitura";
// O usuário só entra deste computador (o programa roda aqui mesmo).
const HOSTS = ["localhost", "127.0.0.1"];

// Uma entrada só pra todas as perguntas (linhas digitadas antes da hora não se
// perdem). Pergunta oculta: nada do que é digitado aparece na tela.
function abrirEntrada({ input = process.stdin, output = process.stdout, tty = !!process.stdin.isTTY } = {}) {
  const rl = readline.createInterface({ input, output, terminal: tty });
  let mudo = false;
  const escrever = rl._writeToOutput.bind(rl);
  rl._writeToOutput = (s) => {
    if (!mudo) escrever(s);
  };
  const linhas = rl[Symbol.asyncIterator]();
  async function perguntar(texto, { oculto = false } = {}) {
    rl.setPrompt(texto);
    rl.prompt();
    mudo = oculto;
    const { value, done } = await linhas.next();
    if (mudo && tty) output.write("\n");
    mudo = false;
    if (done) throw new Error("A entrada fechou antes da resposta. Nada foi feito.");
    return value;
  }
  return { perguntar, fechar: () => rl.close() };
}

// "8.0.36" / "5.6.51-log" / "10.4.32-MariaDB" -> sabe CREATE USER IF NOT EXISTS + ALTER USER?
function sintaxeNova(versao) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(versao || "");
  if (!m) return true;
  const [maior, menor, patch] = m.slice(1).map(Number);
  if (/mariadb/i.test(versao)) return maior > 10 || (maior === 10 && menor >= 2);
  return maior > 5 || (maior === 5 && menor > 7) || (maior === 5 && menor === 7 && patch >= 6);
}

// Comandos (com ? no lugar da senha) pra criar/atualizar o usuário só de leitura.
function comandosUsuario(versao, banco) {
  const comandos = [];
  for (const host of HOSTS) {
    const u = `'${USUARIO}'@'${host}'`;
    if (sintaxeNova(versao)) {
      comandos.push({ sql: `CREATE USER IF NOT EXISTS ${u} IDENTIFIED BY ?`, senha: true });
      comandos.push({ sql: `ALTER USER ${u} IDENTIFIED BY ?`, senha: true });
      comandos.push({ sql: `GRANT SELECT ON \`${banco}\`.* TO ${u}` });
    } else {
      // MySQL 5.5/5.6: o GRANT cria o usuário (ou troca a senha) de uma vez.
      comandos.push({ sql: `GRANT SELECT ON \`${banco}\`.* TO ${u} IDENTIFIED BY ?`, senha: true });
    }
  }
  // Sem FLUSH PRIVILEGES: CREATE USER/GRANT já valem na hora, e o FLUSH pede
  // uma permissão (RELOAD) que o userdba pode não ter.
  return comandos;
}

// Troca (ou acrescenta) NOME=valor no texto do .env, mantendo comentários e o resto.
function definirNoEnv(texto, valores) {
  let saida = texto;
  for (const [nome, valor] of Object.entries(valores)) {
    const linha = `${nome}=${valor}`;
    const regra = new RegExp(`^${nome}=.*$`, "m");
    saida = regra.test(saida) ? saida.replace(regra, () => linha) : `${saida.replace(/\s*$/, "")}\n${linha}\n`;
  }
  return saida;
}

// Com maiúscula, minúscula, número e símbolo: passa na regra de senha forte do
// MySQL (validate_password), se estiver ligada. Os símbolos não precisam de
// aspas no .env (nada de # nem aspas).
function senhaAleatoria(tamanho = 24) {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.@!";
  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[-_.@!]/];
  for (;;) {
    const senha = Array.from(crypto.randomBytes(tamanho), (b) => letras[b % letras.length]).join("");
    if (classes.every((c) => c.test(senha))) return senha;
  }
}

async function main() {
  const mysql = require("mysql2/promise");
  const texto = fs.readFileSync(fs.existsSync(ENV) ? ENV : EXEMPLO, "utf8");
  const atual = dotenv.parse(texto);
  const host = (atual.MYSQL_HOST || "127.0.0.1").trim();
  const port = Number(atual.MYSQL_PORT || 3306);
  const banco = (atual.MYSQL_BANCO || "orbitadb").trim();
  if (!["127.0.0.1", "localhost"].includes(host)) {
    throw new Error(`MYSQL_HOST no .env é ${host}: rode este programa no próprio computador do MySQL (127.0.0.1).`);
  }
  if (!/^[A-Za-z0-9_]+$/.test(banco)) throw new Error(`MYSQL_BANCO inválido no .env: ${banco}`);

  console.log(`MySQL em ${host}:${port}, banco ${banco}.`);
  const entrada = abrirEntrada();
  let admin;
  let senhaAdmin;
  try {
    // O Órbita conecta com o userdba: usuário e senha ficam no user.config do
    // Adm.exe (ver LEIA-ME.md, passo 3).
    admin = (await entrada.perguntar("Usuário administrador do MySQL (root ou userdba) [root]: ")).trim() || "root";
    senhaAdmin = await entrada.perguntar(`Senha do ${admin} do MySQL (não aparece enquanto digita): `, { oculto: true });
  } finally {
    entrada.fechar();
  }

  let conexao;
  try {
    conexao = await mysql.createConnection({ host, port, user: admin, password: senhaAdmin });
  } catch (err) {
    if (err.code === "ER_ACCESS_DENIED_ERROR") throw new Error(`O MySQL recusou a senha do ${admin}. Nada foi feito.`);
    if (err.code === "ECONNREFUSED") throw new Error(`MySQL não respondeu em ${host}:${port} — o Órbita/MySQL está ligado? Nada foi feito.`);
    throw err;
  }
  const senha = senhaAleatoria();
  try {
    const [[{ versao }]] = await conexao.query("SELECT VERSION() AS versao");
    const [bancos] = await conexao.query("SHOW DATABASES LIKE ?", [banco]);
    if (!bancos.length) throw new Error(`O banco ${banco} não existe neste MySQL. Confira MYSQL_BANCO no .env. Nada foi feito.`);
    for (const c of comandosUsuario(versao, banco)) {
      try {
        await conexao.query(c.sql, c.senha ? [senha] : []);
      } catch (err) {
        if (/ACCESS_DENIED/.test(err.code || "")) {
          throw new Error(
            `O ${admin} não tem permissão pra criar usuário no MySQL (${err.code}). Rode de novo com o root, ` +
              "ou peça ao suporte do Órbita pra rodar o criar-usuario-leitura.sql."
          );
        }
        if (err.code === "ER_NOT_VALID_PASSWORD") {
          throw new Error("O MySQL recusou a senha gerada pela regra de senha dele. Rode de novo (sai outra senha).");
        }
        throw err;
      }
    }
  } finally {
    await conexao.end().catch(() => {});
  }

  // O usuário já existe com a senha nova: grava o .env antes do teste, senão
  // um teste que falha deixa a senha perdida.
  const valores = { MYSQL_USUARIO: USUARIO, MYSQL_SENHA: senha, MYSQL_BANCO: banco };
  const chaveNova = !(atual.ERP_SYNC_KEY || "").trim();
  if (chaveNova) valores.ERP_SYNC_KEY = crypto.randomBytes(32).toString("base64url");
  fs.writeFileSync(ENV, definirNoEnv(texto, valores));

  // Confere entrando como o usuário novo: conecta, lê e não pode gravar.
  let teste;
  try {
    teste = await mysql.createConnection({ host, port, user: USUARIO, password: senha, database: banco });
  } catch (err) {
    throw new Error(
      `O ${USUARIO} foi criado e o .env gravado, mas o login com ele falhou (${err.code || err.message}). ` +
        "Rode node 1-conferir-banco.js pra ver o erro."
    );
  }
  try {
    const permissoes = (await teste.query("SHOW GRANTS FOR CURRENT_USER()"))[0].map((l) => Object.values(l)[0]);
    const gravacao = permissoes.filter((g) => /ALL PRIVILEGES|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE/i.test(g.replace(/GRANT USAGE/i, "")));
    if (gravacao.length) {
      console.log(`ATENÇÃO: o ${USUARIO} já existia com permissão de gravação. Peça pra tirar (REVOKE) antes de ligar:`);
      for (const g of gravacao) console.log(`  ${g}`);
    }
  } finally {
    await teste.end().catch(() => {});
  }

  console.log(`\nOK: usuário ${USUARIO} criado (só consulta) e .env atualizado.`);
  if (chaveNova) {
    console.log("\nChave do CRM — cole no Railway (serviço do CRM > Variables > New Variable, nome ERP_SYNC_KEY):\n");
    console.log(`  ${valores.ERP_SYNC_KEY}\n`);
    console.log("Ela também fica no .env, na linha ERP_SYNC_KEY. Não mande por WhatsApp nem e-mail.");
  } else {
    console.log("A chave do CRM (ERP_SYNC_KEY) que já estava no .env foi mantida.");
  }
  console.log("\nPróximo passo: node 1-conferir-banco.js");
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\nErro: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { abrirEntrada, sintaxeNova, comandosUsuario, definirNoEnv, senhaAleatoria };
