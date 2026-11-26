// Importação automática do AlphaDashboard: o CRM busca os dados da loja lá,
// sem programa nenhum no computador da Reis. Liga sozinha quando as variáveis
// ALPHA_DASHBOARD_* estão no Railway (ver client.ts); sem elas, não faz nada.
//
// A cada 15 s confere o que está vencido (é só uma leitura no banco):
// - botão "Atualizar agora": pede ao agente da loja uma sincronização
//   (POST /sync-now), espera ele mandar e traz as vendas de hoje e ontem;
// - vendas de hoje e ontem: a cada 10 min (o agente manda a cada 60 min, ou na
//   hora quando alguém pede);
// - produtos e contas: a cada 1 h (o agente manda o estoque no máximo 1x/h);
// - conferência diária: relê 45 dias de vendas (venda cancelada depois) e as
//   contas baixadas/canceladas dos últimos 2 anos;
// - histórico: na primeira vez, volta 12 meses, 30 dias por vez.
// O que já foi feito fica na linha "alpha" do ErpSyncState (campo lastBatch),
// então um restart do servidor continua de onde parou.
import { prisma } from "@/lib/prisma";
import { pendingSyncRequest } from "../sync-request";
import { ALPHA_ENV_VARS, AlphaError, alphaConfig, createAlphaClient, type AlphaClient } from "./client";
import { diasAtras, importarContas, importarProdutos, importarVendas } from "./importer";
import { diaLoja } from "./map";

const TICK_MS = 15_000;
const VENDAS_MS = 10 * 60_000;
const PRODUTOS_MS = 60 * 60_000;
const CONTAS_MS = 60 * 60_000;
const CONFERENCIA_MS = 24 * 60 * 60_000;
// Depois do sync-now: o agente confere a cada 10 s e ainda precisa ler o Órbita e mandar.
const ESPERA_AGENTE_MS = 45_000;
export const DIAS_HISTORICO = 365;
const DIAS_POR_RODADA_HISTORICO = 30;

export type EstadoAlpha = {
  vendasEm?: number;
  produtosEm?: number;
  contasEm?: number;
  conferenciaEm?: number;
  // Dia mais antigo já lido no histórico ("AAAA-MM-DD"); historicoCompleto quando chegou nos 12 meses.
  historicoAte?: string;
  historicoCompleto?: boolean;
  // A API já devolveu algum dado da loja (antes disso o CRM não sai da demonstração).
  temDados?: boolean;
  syncNowPedido?: string;
  syncNowEm?: number;
  pausaAte?: number;
  ultimoErro?: string | null;
};

const ID = "alpha";

export async function lerEstado(): Promise<EstadoAlpha> {
  const linha = await prisma.erpSyncState.findUnique({ where: { id: ID }, select: { lastBatch: true } });
  return (linha?.lastBatch as EstadoAlpha | null) ?? {};
}

async function gravarEstado(estado: EstadoAlpha) {
  await prisma.erpSyncState.upsert({
    where: { id: ID },
    create: { id: ID, lastBatch: estado, lastSyncAt: new Date() },
    update: { lastBatch: estado, lastSyncAt: new Date() },
  });
}

function registrar(etapa: string, r: { lidos: number; gravados: number; recusados: number; avisos: string[] }, inicio: number) {
  const s = ((Date.now() - inicio) / 1000).toFixed(0);
  console.log(
    `[alpha] ${etapa}: ${r.lidos} lidos, ${r.gravados} gravados${r.recusados ? `, ${r.recusados} recusados` : ""} (${s} s)` +
      (r.avisos.length ? ` — ${r.avisos.join("; ")}` : "")
  );
}

// Uma passada. Exportada pro teste; quem chama garante que não roda duas ao mesmo tempo.
export async function rodadaAlpha(client: AlphaClient, agora = Date.now()): Promise<void> {
  const estado = await lerEstado();
  if (estado.pausaAte && agora < estado.pausaAte) return;
  const salvar = async (mudancas: Partial<EstadoAlpha>) => {
    Object.assign(estado, mudancas, { ultimoErro: null });
    await gravarEstado(estado);
  };

  try {
    // 1. Botão "Atualizar agora". Enquanto espera o agente, não começa rodada longa.
    const pedido = await pendingSyncRequest();
    if (pedido) {
      const chave = pedido.toISOString();
      if (estado.syncNowPedido !== chave) {
        await client.post("/sync-now").catch((err) => console.error("[alpha] sync-now falhou:", (err as Error).message));
        await salvar({ syncNowPedido: chave, syncNowEm: agora });
        return;
      }
      if (agora - (estado.syncNowEm ?? 0) < ESPERA_AGENTE_MS) return;
      const inicio = Date.now();
      const r = await importarVendas(client, diasAtras(0, 2, agora), { handledRequestAt: chave });
      registrar("vendas (pedido do botão)", r, inicio);
      await salvar({ vendasEm: agora, temDados: estado.temDados || r.lidos > 0 });
      return;
    }

    // 2. Vendas de hoje e ontem.
    if (!estado.vendasEm || agora - estado.vendasEm >= VENDAS_MS) {
      const inicio = Date.now();
      // Já com dado da loja: grava mesmo sem novidade, pra tela mostrar "atualizado há X min".
      const r = await importarVendas(client, diasAtras(0, 2, agora), { sempreGravar: !!estado.temDados });
      registrar("vendas", r, inicio);
      await salvar({ vendasEm: agora, temDados: estado.temDados || r.lidos > 0 });
    }

    // 3. Produtos.
    if (!estado.produtosEm || agora - estado.produtosEm >= PRODUTOS_MS) {
      const inicio = Date.now();
      const r = await importarProdutos(client);
      registrar("produtos", r, inicio);
      await salvar({ produtosEm: agora, temDados: estado.temDados || r.lidos > 0 });
    }

    // 4. Contas.
    if (!estado.contasEm || agora - estado.contasEm >= CONTAS_MS) {
      const inicio = Date.now();
      const r = await importarContas(client, { diasFechados: 60 });
      registrar("contas", r, inicio);
      await salvar({ contasEm: agora, temDados: estado.temDados || r.lidos > 0 });
    }

    // 5. Histórico (primeira vez): 30 dias por passada, do mais recente pro mais antigo.
    if (!estado.historicoCompleto) {
      const limite = diaLoja(-DIAS_HISTORICO, agora);
      // Começa em anteontem (hoje e ontem já vêm na leitura rápida).
      let inicioDias = 2;
      if (estado.historicoAte) {
        inicioDias = Math.round((Date.parse(diaLoja(0, agora)) - Date.parse(estado.historicoAte)) / 86_400_000) + 1;
      }
      const quantidade = Math.max(0, Math.min(DIAS_POR_RODADA_HISTORICO, DIAS_HISTORICO - inicioDias + 1));
      if (quantidade > 0) {
        const dias = diasAtras(inicioDias, quantidade, agora);
        const inicio = Date.now();
        const r = await importarVendas(client, dias);
        registrar(`histórico de vendas ${dias[dias.length - 1]} a ${dias[0]}`, r, inicio);
        const maisAntigo = dias[dias.length - 1];
        await salvar({ historicoAte: maisAntigo, historicoCompleto: maisAntigo <= limite, temDados: estado.temDados || r.lidos > 0 });
      } else {
        await salvar({ historicoCompleto: true });
      }
      return; // conferência diária só depois do histórico
    }

    // 6. Conferência diária.
    if (!estado.conferenciaEm || agora - estado.conferenciaEm >= CONFERENCIA_MS) {
      let inicio = Date.now();
      const v = await importarVendas(client, diasAtras(2, 45, agora));
      registrar("conferência de vendas (45 dias)", v, inicio);
      inicio = Date.now();
      const c = await importarContas(client, { diasFechados: 730 });
      registrar("conferência de contas", c, inicio);
      await salvar({ conferenciaEm: agora, contasEm: agora });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const pausaAte = agora + (err instanceof AlphaError && err.esperarMs ? err.esperarMs : 5 * 60_000);
    console.error(`[alpha] ${msg} Tenta de novo às ${new Date(pausaAte).toISOString()}.`);
    estado.pausaAte = pausaAte;
    estado.ultimoErro = msg;
    await gravarEstado(estado).catch(() => {});
  }
}

const globalAlpha = globalThis as unknown as { __alphaImport?: boolean };

export function startAlphaImport(): void {
  const temAlguma = ALPHA_ENV_VARS.some((k) => process.env[k]);
  const config = alphaConfig();
  if (!config) {
    if (temAlguma) {
      console.error(
        "[alpha] variáveis ALPHA_DASHBOARD_* incompletas ou inválidas (a chave começa com adk_; sem chave, CNPJ + LOGIN + SENHA): importação desligada."
      );
    }
    return;
  }
  if (globalAlpha.__alphaImport) return;
  globalAlpha.__alphaImport = true;
  const client = createAlphaClient(config);
  let rodando = false;
  const tick = async () => {
    if (rodando) return;
    rodando = true;
    try {
      await rodadaAlpha(client);
    } catch (err) {
      console.error("[alpha] falha inesperada:", err);
    } finally {
      rodando = false;
    }
  };
  console.log(`[alpha] importação do AlphaDashboard ligada (${config.chave !== undefined ? "chave de integração" : "login de usuário"}).`);
  setTimeout(() => void tick(), 20_000).unref();
  setInterval(() => void tick(), TICK_MS).unref();
}
