// Impede duas sincronizações ao mesmo tempo (a primeira, com o histórico
// todo, pode passar dos 10 min do agendamento). Trava largada por um processo
// que morreu (queda de luz) é ignorada.
const fs = require("fs");
const path = require("path");

const ARQUIVO = path.join(__dirname, ".sincronizando");
const VENCE_EM_MS = 3 * 60 * 60 * 1000;

function vivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM"; // existe, só não é nosso
  }
}

// Devolve a função de soltar, ou null se outra sincronização está rodando.
function travar() {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const fd = fs.openSync(ARQUIVO, "wx");
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, desde: Date.now() }));
      fs.closeSync(fd);
      return () => fs.rmSync(ARQUIVO, { force: true });
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      let dono = null;
      try {
        dono = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
      } catch {
        // arquivo pela metade: trata como largado
      }
      if (dono && vivo(dono.pid) && Date.now() - dono.desde < VENCE_EM_MS) return null;
      fs.rmSync(ARQUIVO, { force: true });
    }
  }
  return null;
}

module.exports = { travar };
