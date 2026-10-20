// Envia pro CRM (POST /api/erp/sync, chave no Authorization). O CRM grava por
// id do ERP: reenviar o mesmo lote não duplica nada.

class ErroFatal extends Error {} // não adianta tentar de novo (chave errada, endereço errado)

async function postar(config, corpo, { tentativas = 3 } = {}) {
  let ultimoErro;
  for (let t = 1; t <= tentativas; t++) {
    try {
      const resposta = await fetch(`${config.crmUrl}/api/erp/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.chave}` },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(180_000),
      });
      const texto = await resposta.text();
      let json = null;
      try {
        json = JSON.parse(texto);
      } catch {
        // resposta que não é JSON (página de erro do proxy, por exemplo)
      }
      if (resposta.ok) return { ok: true, json };
      if (resposta.status === 401) throw new ErroFatal("CRM recusou a chave (401): confira ERP_SYNC_KEY aqui e no Railway.");
      if (resposta.status === 404) throw new ErroFatal(`Endereço não encontrado (404): confira CRM_URL (${config.crmUrl}).`);
      if (resposta.status === 400 || resposta.status === 413) return { ok: false, recusado: true, status: resposta.status, json };
      ultimoErro = new Error(`CRM respondeu ${resposta.status}: ${(json && json.error) || texto.slice(0, 200)}`);
    } catch (err) {
      if (err instanceof ErroFatal) throw err;
      ultimoErro = err;
    }
    if (t < tentativas) await new Promise((r) => setTimeout(r, 5_000 * t));
  }
  throw ultimoErro;
}

// Manda `registros` de um tipo (products, sales...) em lotes. Registro que o
// CRM recusa (400 = fora do formato) fica de fora, avisado no log — um
// registro ruim não trava todo o resto. O CRM diz a posição de cada registro
// errado (issues[].path = [tipo, posição, campo]); quando não diz (413 = lote
// grande demais), o lote é dividido ao meio. Chama `aoEnviar(lote)` a cada
// lote gravado e `aoRecusar(registro, motivo)` a cada registro que ficou de fora.
async function enviarEmLotes(config, tipo, registros, tamanho, ganchos) {
  for (let i = 0; i < registros.length; i += tamanho) {
    await enviarLote(config, tipo, registros.slice(i, i + tamanho), ganchos);
  }
}

async function enviarLote(config, tipo, lote, ganchos) {
  let restantes = lote;
  while (restantes.length) {
    const r = await postar(config, { [tipo]: restantes.map((x) => x.envio) });
    if (r.ok) {
      await ganchos.aoEnviar(restantes);
      return;
    }
    const ruins = new Map(); // posição no lote -> motivo
    for (const problema of r.json?.issues || []) {
      const [t, posicao, ...campo] = problema.path || [];
      if (t === tipo && Number.isInteger(posicao) && posicao < restantes.length && !ruins.has(posicao)) {
        ruins.set(posicao, `${campo.join(".") || "registro"}: ${problema.message}`);
      }
    }
    if (!ruins.size) {
      if (restantes.length === 1) {
        await ganchos.aoRecusar(restantes[0], `CRM respondeu ${r.status}${r.json?.error ? ` (${r.json.error})` : ""}`);
        return;
      }
      const meio = Math.ceil(restantes.length / 2);
      await enviarLote(config, tipo, restantes.slice(0, meio), ganchos);
      await enviarLote(config, tipo, restantes.slice(meio), ganchos);
      return;
    }
    for (const [posicao, motivo] of ruins) await ganchos.aoRecusar(restantes[posicao], motivo);
    restantes = restantes.filter((_, i) => !ruins.has(i));
  }
}

module.exports = { postar, enviarEmLotes, ErroFatal };
