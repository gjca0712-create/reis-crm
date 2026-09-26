import type { prisma } from "@/lib/prisma";

export type ErpTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Trava única do espelho do ERP: carregar/apagar a demonstração e o começo de
// uma sincronização real nunca rodam ao mesmo tempo. Sem isso, a primeira
// sincronização podia chegar no meio da geração da demo e gravar dado real em
// cima de linha marcada como demo (que a sincronização seguinte apagaria).
// pg_advisory_xact_lock solta sozinha no fim da transação.
const ERP_MIRROR_LOCK = 7_390_214;

export async function lockErpMirror(tx: ErpTx) {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${ERP_MIRROR_LOCK})`);
}
