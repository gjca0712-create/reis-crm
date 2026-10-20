// Log em logs/AAAA-MM.log (um arquivo por mês, guarda os últimos 6) e na tela.
// Sem nome de cliente nem valor de título: só contagens, ids e erros.
const fs = require("fs");
const path = require("path");

const PASTA = path.join(__dirname, "logs");
const MESES_GUARDADOS = 6;

function agoraTexto() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function abrirLog() {
  fs.mkdirSync(PASTA, { recursive: true });
  const arquivo = path.join(PASTA, `${agoraTexto().slice(0, 7)}.log`);
  const antigos = fs
    .readdirSync(PASTA)
    .filter((f) => /^\d{4}-\d{2}\.log$/.test(f))
    .sort()
    .reverse()
    .slice(MESES_GUARDADOS);
  for (const f of antigos) fs.rmSync(path.join(PASTA, f), { force: true });

  const escrever = (nivel, mensagem) => {
    const linha = `[${agoraTexto()}] ${nivel ? `${nivel} ` : ""}${mensagem}`;
    (nivel === "ERRO" ? console.error : console.log)(linha);
    try {
      fs.appendFileSync(arquivo, `${linha}\n`);
    } catch {
      // disco cheio/sem permissão: pelo menos sai na tela
    }
  };
  return {
    info: (m) => escrever("", m),
    aviso: (m) => escrever("AVISO", m),
    erro: (m) => escrever("ERRO", m),
  };
}

module.exports = { abrirLog };
