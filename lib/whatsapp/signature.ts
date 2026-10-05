import { prisma } from "@/lib/prisma";

// Nome do atendente em cima da mensagem que o cliente recebe, em negrito:
//
//   *Emilly:*
//   Bom dia! Temos sim.
//
// Só na mensagem que sai pro WhatsApp — no CRM o texto fica limpo (o nome já
// aparece embaixo do balão). Usa o nome cadastrado em Atendentes, lido na hora
// (trocou o nome lá, já sai o novo). WHATSAPP_AGENT_NAME=0 no Railway desliga.
export function signAgentMessage(name: string | null | undefined, body: string): string {
  const clean = name?.replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();
  if (!clean || process.env.WHATSAPP_AGENT_NAME === "0") return body;
  return body ? `*${clean}:*\n${body}` : `*${clean}*`;
}

export async function agentName(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name ?? null;
}
