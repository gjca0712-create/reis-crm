// Descobre em qual MySQL e em qual banco o Órbita deste computador trabalha de
// verdade, e deixa o .env apontado pra lá.
//
//   node descobrir-banco.js
//
// O Órbita (Adm.exe e Vendas.exe) não precisa ter o banco no próprio computador:
// todos os computadores da loja podem apontar pra um MySQL só (outro PC da rede
// ou um servidor na internet). O endereço fica na configuração dele
// (IpDbPrincipal, PortaDbPrincipal, EsquemaDbPrincipal): no Adm.exe.config da
// pasta do programa ou no user.config de cada usuário do Windows.
//
// Este programa lê essas configurações, entra em cada MySQL com o mesmo acesso
// que o Órbita usa e mostra a última venda de cada banco que tem a tabela de
// vendas. O banco com a venda mais recente vai pro .env (MYSQL_HOST, MYSQL_PORT,
// MYSQL_BANCO). A senha do Órbita não aparece na tela e não vai pro .env.
// Só consulta: não grava nada no MySQL.
const fs = require("fs");
const path = require("path");

const ENV = path.join(__dirname, ".env");
const EXEMPLO = path.join(__dirname, ".env.exemplo");
const CHAVES = ["IpDbPrincipal", "PortaDbPrincipal", "EsquemaDbPrincipal", "UsuarioDbPricipal", "UsuarioDbPrincipal", "SenhaDbPrincipal"];
const LOCAIS = ["127.0.0.1", "localhost", "::1"];
// Venda mais antiga que isso no "melhor" banco = ainda não achamos o banco certo.
const DIAS_VENDA_RECENTE = 7;

function decodificarXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

// Seções de configuração do .NET (<Vendas.Properties.Settings> etc.) que têm
// alguma chave do banco -> [{ secao, valores: { IpDbPrincipal: "...", ... } }]
function lerSecoes(texto) {
  const secoes = [];
  const regraSecao = /<([\w.]+)>\s*((?:<setting\b[\s\S]*?<\/setting>\s*)+)<\/\1>/g;
  const regraItem = /<setting\s+name="([^"]+)"[^>]*>\s*(?:<value>([\s\S]*?)<\/value>|<value\s*\/>)\s*<\/setting>/g;
  for (const s of texto.matchAll(regraSecao)) {
    const valores = {};
    for (const item of s[2].matchAll(regraItem)) {
      if (CHAVES.includes(item[1])) valores[item[1]] = decodificarXml(item[2] || "").trim();
    }
    if (Object.keys(valores).length) secoes.push({ secao: s[1], valores });
  }
  return secoes;
}

function lerSeTiver(arquivo) {
  try {
    if (fs.statSync(arquivo).size > 2_000_000) return null;
    const texto = fs.readFileSync(arquivo, "utf8");
    return texto.includes("DbPrincipal") ? texto : null;
  } catch {
    return null;
  }
}

function listarPastas(pasta) {
  try {
    return fs.readdirSync(pasta, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(pasta, d.name));
  } catch {
    return [];
  }
}

// "Adm.exe.config" -> "Adm"; pasta "Adm.exe_Url_xxx" -> "Adm"
const programaDe = (nome) => nome.replace(/\.exe.*$/i, "");

// Procura as configurações do Órbita: <Arquivos de Programas>\<fabricante>\<programa>\*.exe.config
// e C:\Users\<usuário>\AppData\Local\<fabricante>\<programa>.exe_*\<versão>\user.config.
// (DESCOBRIR_PASTAS_PROGRAMAS / DESCOBRIR_PASTA_USUARIOS só servem pro teste.)
function acharConfiguracoes({
  pastasProgramas = process.env.DESCOBRIR_PASTAS_PROGRAMAS ? process.env.DESCOBRIR_PASTAS_PROGRAMAS.split(";") : null,
  pastaUsuarios = process.env.DESCOBRIR_PASTA_USUARIOS || null,
} = {}) {
  const bases = pastasProgramas || [
    ...new Set([process.env["ProgramFiles(x86)"], process.env.ProgramFiles, "C:\\Program Files (x86)", "C:\\Program Files"].filter(Boolean)),
  ];
  const usuarios = pastaUsuarios || path.join(process.env.SystemDrive || "C:", "Users");
  const achados = [];
  const semAcesso = [];

  for (const base of bases) {
    for (const fabricante of listarPastas(base)) {
      for (const pasta of [fabricante, ...listarPastas(fabricante)]) {
        let nomes = [];
        try {
          nomes = fs.readdirSync(pasta).filter((n) => /\.exe\.config$/i.test(n));
        } catch {}
        for (const nome of nomes) {
          const arquivo = path.join(pasta, nome);
          const texto = lerSeTiver(arquivo);
          if (texto) achados.push({ tipo: "programa", programa: programaDe(nome), arquivo, origem: `${nome} (pasta do programa)`, secoes: lerSecoes(texto) });
        }
      }
    }
  }

  for (const perfil of listarPastas(usuarios)) {
    const local = path.join(perfil, "AppData", "Local");
    if (!fs.existsSync(local)) continue;
    let fabricantes;
    try {
      fabricantes = fs.readdirSync(local, { withFileTypes: true }).filter((d) => d.isDirectory());
    } catch {
      semAcesso.push(path.basename(perfil));
      continue;
    }
    for (const f of fabricantes) {
      for (const pastaPrograma of listarPastas(path.join(local, f.name)).filter((p) => /\.exe_/i.test(path.basename(p)))) {
        for (const pastaVersao of listarPastas(pastaPrograma)) {
          const arquivo = path.join(pastaVersao, "user.config");
          const texto = lerSeTiver(arquivo);
          if (!texto) continue;
          const programa = programaDe(path.basename(pastaPrograma));
          achados.push({
            tipo: "usuario",
            programa,
            arquivo,
            origem: `${programa} ${path.basename(pastaVersao)}, usuário ${path.basename(perfil)} do Windows`,
            secoes: lerSecoes(texto),
          });
        }
      }
    }
  }
  return { achados, semAcesso };
}

// Valor efetivo de cada configuração: o user.config só guarda o que mudou, o
// resto vem do .exe.config do mesmo programa. -> [{ origem, host, port, banco, user, password }]
function montarAcessos(achados) {
  const padroes = new Map();
  for (const a of achados.filter((x) => x.tipo === "programa")) {
    for (const s of a.secoes) {
      if (!padroes.has(`${a.programa}|${s.secao}`)) padroes.set(`${a.programa}|${s.secao}`, s.valores);
      if (!padroes.has(a.programa)) padroes.set(a.programa, s.valores);
    }
  }
  const acessos = [];
  for (const a of achados) {
    for (const s of a.secoes) {
      const base = a.tipo === "usuario" ? padroes.get(`${a.programa}|${s.secao}`) || padroes.get(a.programa) || {} : {};
      const v = { ...base, ...Object.fromEntries(Object.entries(s.valores).filter(([, x]) => x !== "")) };
      const porta = Number(v.PortaDbPrincipal);
      acessos.push({
        origem: a.origem,
        host: v.IpDbPrincipal || "127.0.0.1",
        port: Number.isInteger(porta) && porta > 0 ? porta : 3306,
        banco: v.EsquemaDbPrincipal || "",
        user: v.UsuarioDbPricipal || v.UsuarioDbPrincipal || "",
        password: v.SenhaDbPrincipal || "",
      });
    }
  }
  return acessos;
}

const ehLocal = (host) => LOCAIS.includes(String(host).toLowerCase());
const mesmoServidor = (a, b) => (ehLocal(a.host) && ehLocal(b.host)) || String(a.host).toLowerCase() === String(b.host).toLowerCase();

// Usuários e senhas do Órbita (sem repetir), os que apontam pra este servidor primeiro.
function credenciaisPara(acessos, servidor) {
  const vistas = new Set();
  const lista = [];
  const ordenados = [...acessos].sort((a, b) => Number(mesmoServidor(b, servidor)) - Number(mesmoServidor(a, servidor)));
  for (const a of ordenados) {
    if (!a.user) continue;
    const chave = `${a.user}\u0000${a.password}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    lista.push({ user: a.user, password: a.password });
  }
  return lista;
}

// Entra no MySQL com o primeiro acesso do Órbita que funcionar.
async function entrarComAcessoDoOrbita(servidor, credenciais, opcoes = {}) {
  const mysql = require("mysql2/promise");
  let ultimoErro = null;
  for (const c of credenciais) {
    try {
      const conexao = await mysql.createConnection({
        host: servidor.host,
        port: servidor.port,
        user: c.user,
        password: c.password,
        connectTimeout: 8000,
        ...opcoes,
      });
      return { conexao, usuario: c.user };
    } catch (err) {
      ultimoErro = err;
      // Servidor fora do ar: não adianta tentar outra senha.
      if (["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH"].includes(err.code)) break;
    }
  }
  return { conexao: null, erro: ultimoErro };
}

function explicarErro(err) {
  if (!err) return "nenhum usuário do Órbita encontrado pra entrar";
  if (err.code === "ER_ACCESS_DENIED_ERROR") return "recusou o usuário e a senha que estão na configuração do Órbita";
  if (["ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH"].includes(err.code)) return "não respondeu (desligado, ou a rede/firewall bloqueia)";
  if (err.code === "ENOTFOUND") return "esse nome de computador não foi encontrado na rede";
  return err.code || err.message;
}

// Última venda de cada banco que tem a tabela de vendas do Órbita (saidanota).
async function bancosComVendas(conexao) {
  const [[{ agora }]] = await conexao.query("SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS agora");
  const [tabelas] = await conexao.query(
    "SELECT TABLE_SCHEMA AS banco, TABLE_NAME AS tabela FROM information_schema.TABLES WHERE LOWER(TABLE_NAME) = 'saidanota' ORDER BY TABLE_SCHEMA"
  );
  const bancos = [];
  for (const { banco, tabela } of tabelas) {
    try {
      const [[r]] = await conexao.query(
        // Data digitada errada no futuro (ano 2099) não conta como "última venda".
        `SELECT DATE_FORMAT(MAX(CASE WHEN DataEmissao <= NOW() + INTERVAL 1 DAY THEN DataEmissao END), '%Y-%m-%d %H:%i:%s') AS ultima,
                COUNT(*) AS total,
                COALESCE(SUM(DataEmissao >= NOW() - INTERVAL 30 DAY), 0) AS recentes
           FROM \`${banco.replace(/`/g, "``")}\`.\`${tabela.replace(/`/g, "``")}\``
      );
      bancos.push({ banco, ultima: r.ultima || null, total: Number(r.total), recentes: Number(r.recentes) });
    } catch (err) {
      bancos.push({ banco, erro: err.code || err.message });
    }
  }
  return { agora, bancos };
}

const doisDigitos = (n) => String(n).padStart(2, "0");
function dataBr(texto) {
  if (!texto) return "nenhuma";
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(texto);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : texto;
}
function agoraLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())} ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}:${doisDigitos(d.getSeconds())}`;
}
const paraData = (texto) => new Date(texto.replace(" ", "T"));
const milhar = (n) => Number(n).toLocaleString("pt-BR");

async function main() {
  const { definirNoEnv } = require("./0-preparar");
  const dotenv = require("dotenv");

  const { achados, semAcesso } = acharConfiguracoes();
  const acessos = montarAcessos(achados);

  console.log("Configuração do Órbita neste computador:");
  if (!acessos.length) {
    console.log("  Nenhuma encontrada (Adm.exe.config / user.config).");
    console.log("  Rode este comando num computador onde o Órbita (Administrativo ou Vendas) está instalado.");
    process.exitCode = 1;
    return;
  }
  for (const a of acessos) {
    console.log(`  ${a.origem}: ${a.host}:${a.port}, banco ${a.banco || "(padrão do Órbita)"}`);
  }
  if (semAcesso.length) {
    console.log(`  (Não deu pra ler a pasta de: ${semAcesso.join(", ")}. Se precisar, abra o cmd como administrador.)`);
  }

  // Um MySQL por endereço:porta.
  const servidores = [];
  for (const a of acessos) {
    if (!servidores.some((s) => mesmoServidor(s, a) && s.port === a.port)) servidores.push({ host: ehLocal(a.host) ? "127.0.0.1" : a.host, port: a.port });
  }

  console.log("\nÚltima venda em cada banco:");
  const candidatos = [];
  let relogioMysql = null;
  for (const s of servidores) {
    const { conexao, erro } = await entrarComAcessoDoOrbita(s, credenciaisPara(acessos, s));
    if (!conexao) {
      console.log(`  ${s.host}:${s.port}: ${explicarErro(erro)}`);
      continue;
    }
    try {
      const { agora, bancos } = await bancosComVendas(conexao);
      relogioMysql = relogioMysql || agora;
      if (!bancos.length) console.log(`  ${s.host}:${s.port}: nenhum banco com a tabela de vendas do Órbita`);
      for (const b of bancos) {
        if (b.erro) {
          console.log(`  ${s.host}:${s.port}  ${b.banco}: não deu pra ler (${b.erro})`);
          continue;
        }
        console.log(`  ${s.host}:${s.port}  ${b.banco}: última venda ${dataBr(b.ultima)} · ${milhar(b.recentes)} nos últimos 30 dias · ${milhar(b.total)} no total`);
        if (b.ultima) candidatos.push({ ...s, ...b });
      }
    } finally {
      await conexao.end().catch(() => {});
    }
  }

  const relogioPc = agoraLocal();
  console.log(`\nRelógio deste computador: ${dataBr(relogioPc)}${relogioMysql ? ` · relógio do MySQL: ${dataBr(relogioMysql)}` : ""}`);
  if (relogioMysql && Math.abs(paraData(relogioMysql) - paraData(relogioPc)) > 60 * 60 * 1000) {
    console.log("ATENÇÃO: o relógio do MySQL e o deste computador estão diferentes em mais de 1 hora. Acerte a data e a hora do Windows.");
  }

  if (!candidatos.length) {
    console.log("\nNão consegui ler nenhum banco do Órbita. O .env não foi alterado.");
    process.exitCode = 1;
    return;
  }
  const melhor = candidatos.reduce((a, b) => (b.ultima > a.ultima ? b : a));
  const diasDesde = (paraData(relogioPc) - paraData(melhor.ultima)) / 86_400_000;
  if (diasDesde > DIAS_VENDA_RECENTE) {
    console.log(`\nNenhum banco tem venda dos últimos ${DIAS_VENDA_RECENTE} dias: o .env não foi alterado.`);
    console.log("Se o relógio acima está certo, rode este mesmo comando num computador onde o Órbita");
    console.log("mostra as vendas de hoje (um caixa, por exemplo): ele mostra pra onde aquele Órbita aponta.");
    process.exitCode = 1;
    return;
  }

  const texto = fs.readFileSync(fs.existsSync(ENV) ? ENV : EXEMPLO, "utf8");
  const atual = dotenv.parse(texto);
  const antes = { host: (atual.MYSQL_HOST || "127.0.0.1").trim(), port: Number(atual.MYSQL_PORT || 3306), banco: (atual.MYSQL_BANCO || "orbitadb").trim() };
  console.log(`\nBanco certo: ${melhor.host}:${melhor.port}, banco ${melhor.banco} (última venda ${dataBr(melhor.ultima)}).`);
  if (mesmoServidor(antes, melhor) && antes.port === melhor.port && antes.banco === melhor.banco) {
    console.log("O .env já aponta pra ele. Próximo passo: node 1-conferir-banco.js");
    return;
  }
  fs.writeFileSync(ENV, definirNoEnv(texto, { MYSQL_HOST: melhor.host, MYSQL_PORT: String(melhor.port), MYSQL_BANCO: melhor.banco }));
  console.log(`.env atualizado (antes: ${antes.host}:${antes.port}, banco ${antes.banco}).`);
  console.log("\nPróximo passo: node 0-preparar.js (cria o usuário só de leitura nesse banco), depois node 1-conferir-banco.js");
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\nErro: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { lerSecoes, acharConfiguracoes, montarAcessos, credenciaisPara, entrarComAcessoDoOrbita, mesmoServidor, ehLocal, explicarErro };
