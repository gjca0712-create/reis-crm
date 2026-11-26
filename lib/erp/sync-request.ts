import { prisma } from "@/lib/prisma";

// Botão "Atualizar agora": o CRM não alcança o computador da loja (nenhuma
// porta aberta lá), então só anota o pedido. Quem atende:
// - com o AlphaDashboard (lib/erp/alpha/loop.ts): o próprio CRM vê o pedido,
//   pede ao agente da loja (sync-now), espera e busca as vendas;
// - com o programa antigo da loja: ele pergunta a cada minuto (GET em
//   app/api/erp/sync) e, se tiver pedido, roda na hora.
// Nos dois casos o fim da rodada passa o pedido em handledRequestAt e
// applySyncPayload limpa.
// Pedido mais velho que isso é esquecido: o computador estava desligado, e a
// tela já desistiu de esperar.
export const SYNC_REQUEST_TTL_MS = 15 * 60_000;

export function isFreshSyncRequest(requestedAt: Date | null | undefined): requestedAt is Date {
  return !!requestedAt && Date.now() - requestedAt.getTime() < SYNC_REQUEST_TTL_MS;
}

export async function pendingSyncRequest(): Promise<Date | null> {
  const state = await prisma.erpSyncState.findUnique({ where: { id: "erp" }, select: { requestedAt: true } });
  return isFreshSyncRequest(state?.requestedAt) ? state.requestedAt : null;
}

// Pedido já em aberto fica como está: quem clicou de novo espera a mesma rodada.
export async function requestSync(): Promise<void> {
  await prisma.erpSyncState.updateMany({
    where: {
      id: "erp",
      OR: [{ requestedAt: null }, { requestedAt: { lt: new Date(Date.now() - SYNC_REQUEST_TTL_MS) } }],
    },
    data: { requestedAt: new Date() },
  });
}
