import { revalidatePath } from "next/cache";

// "Algo mudou no Suporte": um contador em memória que sobe a cada mensagem
// recebida, editada ou apagada, conexão que cai ou volta e ação de atendente
// (responder, assumir, transferir, resolver...). A tela pergunta a cada 2 s
// (GET /api/whatsapp/versao, LiveRefresh) e só recarrega quando o número muda —
// antes ela recarregava inteira a cada 12 s e a mensagem do cliente demorava
// pra aparecer. Em memória porque o Railway roda uma réplica só (igual aos
// sockets do WhatsApp); no globalThis porque rota, action e o socket do
// Baileys ficam em pacotes diferentes do Next. "boot" muda a cada reinício —
// a tela recarrega depois de um deploy mesmo que o contador volte pro zero.
const g = globalThis as unknown as { __waSupportLive?: { boot: string; n: number } };

function live() {
  return (g.__waSupportLive ??= { boot: Date.now().toString(36), n: 0 });
}

export function touchSupport(): void {
  live().n++;
}

export function supportVersion(): string {
  const l = live();
  return `${l.boot}.${l.n}`;
}

// O que as actions do Suporte chamam depois de mudar alguma coisa: o próprio
// usuário vê na hora (revalidatePath) e os colegas em até 2 s (touchSupport).
export function refreshSupport(): void {
  touchSupport();
  revalidatePath("/admin/whatsapp/suporte");
}
