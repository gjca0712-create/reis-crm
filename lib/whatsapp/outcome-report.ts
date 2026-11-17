import { prisma } from "@/lib/prisma";
import { periodStart, storeDayKey, type MetricsPeriod } from "./metrics";
import {
  QUOTE_LOST_REASONS,
  emptyOutcomeCounts,
  isConversationOutcome,
  outcomeTotal,
  type OutcomeCounts,
  type QuoteLostReason,
} from "./outcome";

// Relatório "Resultado dos atendimentos" (whatsapp/metricas): quantas vendas,
// orçamentos e informações, no geral, por dia e por atendente, e quantos
// orçamentos viraram venda. Conta os atendimentos ABERTOS no período
// (Conversation.createdAt) — cada um entra uma vez só, com o resultado e a
// situação do orçamento que tem hoje.

export type AgentOutcomes = {
  id: string;
  name: string;
  counts: OutcomeCounts;
  // Finalizou sem marcar o resultado.
  unmarked: number;
  // Está com ele, ainda sem resultado (não conta como falta: pode marcar).
  inProgress: number;
  soldValue: number; // R$ das conversas marcadas Venda
  quotes: number; // orçamentos feitos (inclui os que já viraram venda)
  quotesWon: number;
};

export type QuoteFunnel = {
  made: number;
  madeValue: number;
  won: number;
  wonValue: number;
  lost: number;
  open: number;
  openValue: number;
  // Em aberto com o dia do retorno já passado.
  late: number;
  lostReasons: { id: QuoteLostReason; label: string; count: number }[];
};

export type OutcomeReport = {
  total: OutcomeCounts;
  // R$ marcado nas vendas e nos orçamentos (Informação não tem valor).
  value: { VENDA: number; ORCAMENTO: number };
  marked: number;
  // Finalizados sem resultado marcado.
  unmarked: number;
  // Em aberto e sem resultado ainda (com alguém ou na espera).
  inProgress: number;
  quotes: QuoteFunnel;
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
      outcomeValue: true,
      quoteStatus: true,
      quoteLostReason: true,
      followUpAt: true,
      assignedToId: true,
      resolvedById: true,
      createdAt: true,
    },
  });

  const days = new Map<string, OutcomeCounts>();
  for (let t = start.getTime(); t <= now.getTime(); t += 86_400_000) days.set(storeDayKey(new Date(t)), emptyOutcomeCounts());
  const today = storeDayKey(now);

  const total = emptyOutcomeCounts();
  const value = { VENDA: 0, ORCAMENTO: 0 };
  let unmarked = 0;
  let inProgress = 0;
  const quotes: QuoteFunnel = {
    made: 0,
    madeValue: 0,
    won: 0,
    wonValue: 0,
    lost: 0,
    open: 0,
    openValue: 0,
    late: 0,
    lostReasons: [],
  };
  const lostBy = new Map<string, number>();
  const byAgent = new Map<string, Omit<AgentOutcomes, "id" | "name">>();
  const agentRow = (id: string) => {
    let row = byAgent.get(id);
    if (!row) {
      row = { counts: emptyOutcomeCounts(), unmarked: 0, inProgress: 0, soldValue: 0, quotes: 0, quotesWon: 0 };
      byAgent.set(id, row);
    }
    return row;
  };

  for (const c of conversations) {
    const amount = c.outcomeValue === null ? 0 : Number(c.outcomeValue);
    if (isConversationOutcome(c.outcome)) {
      total[c.outcome]++;
      if (c.outcome !== "INFORMACAO") value[c.outcome] += amount;
      const day = days.get(storeDayKey(c.createdAt));
      if (day) day[c.outcome]++;
      if (c.outcomeAgentId) {
        const row = agentRow(c.outcomeAgentId);
        row.counts[c.outcome]++;
        if (c.outcome === "VENDA") row.soldValue += amount;
      }
    } else if (c.status === "OPEN") {
      inProgress++;
      if (c.assignedToId) agentRow(c.assignedToId).inProgress++;
    } else {
      unmarked++;
      if (c.resolvedById) agentRow(c.resolvedById).unmarked++;
    }

    if (c.quoteStatus) {
      quotes.made++;
      quotes.madeValue += amount;
      const row = c.outcomeAgentId ? agentRow(c.outcomeAgentId) : null;
      if (row) row.quotes++;
      if (c.quoteStatus === "VENDIDO") {
        quotes.won++;
        quotes.wonValue += amount;
        if (row) row.quotesWon++;
      } else if (c.quoteStatus === "PERDIDO") {
        quotes.lost++;
        const reason = c.quoteLostReason ?? "OUTRO";
        lostBy.set(reason, (lostBy.get(reason) ?? 0) + 1);
      } else {
        quotes.open++;
        quotes.openValue += amount;
        if (c.followUpAt && storeDayKey(c.followUpAt) < today) quotes.late++;
      }
    }
  }
  quotes.lostReasons = QUOTE_LOST_REASONS.map((r) => ({ id: r.id, label: r.label, count: lostBy.get(r.id) ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  const users = await prisma.user.findMany({
    where: { id: { in: [...byAgent.keys()] } },
    select: { id: true, name: true },
  });
  const agents: AgentOutcomes[] = users
    .map((u) => ({ id: u.id, name: u.name, ...byAgent.get(u.id)! }))
    // Quem mais vendeu primeiro (em quantidade, depois em R$); empate: quem
    // mais marcou, depois o nome.
    .sort(
      (a, b) =>
        b.counts.VENDA - a.counts.VENDA ||
        b.soldValue - a.soldValue ||
        outcomeTotal(b.counts) - outcomeTotal(a.counts) ||
        a.name.localeCompare(b.name, "pt-BR")
    );

  return {
    total,
    value,
    marked: outcomeTotal(total),
    unmarked,
    inProgress,
    quotes,
    days: [...days].map(([day, counts]) => ({ day, counts })),
    agents,
  };
}
