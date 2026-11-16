import { prisma } from "@/lib/prisma";
import { periodStart, storeDayKey, type MetricsPeriod } from "./metrics";
import { emptyOutcomeCounts, isConversationOutcome, outcomeTotal, type OutcomeCounts } from "./outcome";

// Relatório "Resultado dos atendimentos" (whatsapp/metricas): quantas vendas,
// orçamentos e informações, no geral, por dia e por atendente. Conta os
// atendimentos ABERTOS no período (Conversation.createdAt) — cada um entra uma
// vez só, com o resultado que tem hoje.

export type AgentOutcomes = {
  id: string;
  name: string;
  counts: OutcomeCounts;
  // Finalizou sem marcar o resultado.
  unmarked: number;
  // Está com ele, ainda sem resultado (não conta como falta: pode marcar).
  inProgress: number;
};

export type OutcomeReport = {
  total: OutcomeCounts;
  marked: number;
  // Finalizados sem resultado marcado.
  unmarked: number;
  // Em aberto e sem resultado ainda (com alguém ou na espera).
  inProgress: number;
  // Um por dia do período, do mais antigo pro de hoje (AAAA-MM-DD, fuso da loja).
  days: { day: string; counts: OutcomeCounts }[];
  agents: AgentOutcomes[];
};

export async function loadOutcomeReport(period: MetricsPeriod, now = new Date()): Promise<OutcomeReport> {
  const start = periodStart(period, now);
  const conversations = await prisma.conversation.findMany({
    where: { createdAt: { gte: start } },
    select: {
      status: true,
      outcome: true,
      outcomeAgentId: true,
      assignedToId: true,
      resolvedById: true,
      createdAt: true,
    },
  });

  const days = new Map<string, OutcomeCounts>();
  for (let t = start.getTime(); t <= now.getTime(); t += 86_400_000) days.set(storeDayKey(new Date(t)), emptyOutcomeCounts());

  const total = emptyOutcomeCounts();
  let unmarked = 0;
  let inProgress = 0;
  const byAgent = new Map<string, Omit<AgentOutcomes, "id" | "name">>();
  const agentRow = (id: string) => {
    let row = byAgent.get(id);
    if (!row) byAgent.set(id, (row = { counts: emptyOutcomeCounts(), unmarked: 0, inProgress: 0 }));
    return row;
  };

  for (const c of conversations) {
    if (isConversationOutcome(c.outcome)) {
      total[c.outcome]++;
      const day = days.get(storeDayKey(c.createdAt));
      if (day) day[c.outcome]++;
      if (c.outcomeAgentId) agentRow(c.outcomeAgentId).counts[c.outcome]++;
    } else if (c.status === "OPEN") {
      inProgress++;
      if (c.assignedToId) agentRow(c.assignedToId).inProgress++;
    } else {
      unmarked++;
      if (c.resolvedById) agentRow(c.resolvedById).unmarked++;
    }
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...byAgent.keys()] } },
    select: { id: true, name: true },
  });
  const agents: AgentOutcomes[] = users
    .map((u) => ({ id: u.id, name: u.name, ...byAgent.get(u.id)! }))
    // Quem mais vendeu primeiro; empate: quem mais marcou, depois o nome.
    .sort(
      (a, b) =>
        b.counts.VENDA - a.counts.VENDA ||
        outcomeTotal(b.counts) - outcomeTotal(a.counts) ||
        a.name.localeCompare(b.name, "pt-BR")
    );

  return {
    total,
    marked: outcomeTotal(total),
    unmarked,
    inProgress,
    days: [...days].map(([day, counts]) => ({ day, counts })),
    agents,
  };
}
