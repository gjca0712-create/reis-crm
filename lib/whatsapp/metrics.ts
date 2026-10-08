import { prisma } from "@/lib/prisma";
import { closingKind } from "./closing";
import { isRatingPrompt } from "./inbound";
import { overdueConversations, withWaitingSince } from "./queue";

// Métricas de atendimento do WhatsApp (whatsapp/metricas/page.tsx) — só CEO e
// Gerente (feature whatsapp_gestao). Tudo conta a partir da meia-noite no fuso
// da loja e ignora mensagem apagada pra todos e o pedido de avaliação automático.

export type MetricsPeriod = "hoje" | "7d" | "30d" | "mes";

export const METRICS_PERIODS: { id: MetricsPeriod; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "mes", label: "Este mês" },
];

export function parseMetricsPeriod(value: string | undefined): MetricsPeriod {
  return METRICS_PERIODS.some((p) => p.id === value) ? (value as MetricsPeriod) : "7d";
}

// en-CA dá AAAA-MM-DD: o dia de hoje no fuso da loja.
const storeDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" });

// Meia-noite (fuso da loja) do primeiro dia do período. America/Bahia não tem
// horário de verão: meia-noite lá é sempre 03:00 UTC.
export function periodStart(period: MetricsPeriod, now: Date): Date {
  const [y, m, d] = storeDay.format(now).split("-").map(Number);
  const midnight = (day: number) => new Date(Date.UTC(y, m - 1, day, 3));
  if (period === "hoje") return midnight(d);
  if (period === "7d") return midnight(d - 6);
  if (period === "30d") return midnight(d - 29);
  return midnight(1);
}

// --- Tempo de resposta ----------------------------------------------------------

export type MetricMessage = {
  conversationId: string;
  direction: string;
  body: string;
  originalBody: string | null;
  mediaType: string | null;
  createdAt: Date;
  senderId: string | null;
};

// Uma vez que o cliente ficou esperando: da primeira mensagem dele depois da
// nossa última até a nossa próxima. answeredBy null + answeredAt preenchido =
// respondido pelo celular pareado. answeredAt null = ninguém respondeu (ainda
// esperando, ou a conversa foi finalizada sem resposta).
export type ResponseEpisode = {
  conversationId: string;
  askedAt: Date;
  answeredAt: Date | null;
  answeredBy: string | null;
};

// Mensagens ordenadas por conversa e hora. Agradecimento não abre espera (é a
// mesma regra da faixa vermelha — needsReply); o pedido de avaliação fecha a
// espera sem contar como resposta.
export function responseEpisodes(messages: MetricMessage[]): ResponseEpisode[] {
  const episodes: ResponseEpisode[] = [];
  let open: ResponseEpisode | null = null;
  let conversationId: string | null = null;

  for (const m of messages) {
    if (m.conversationId !== conversationId) {
      if (open) episodes.push(open);
      open = null;
      conversationId = m.conversationId;
    }
    if (m.direction === "IN") {
      if (!open && closingKind(m.body, m.mediaType) !== "thanks") {
        open = { conversationId: m.conversationId, askedAt: m.createdAt, answeredAt: null, answeredBy: null };
      }
    } else if (open) {
      if (!isRatingPrompt(m)) {
        open.answeredAt = m.createdAt;
        open.answeredBy = m.senderId;
      }
      episodes.push(open);
      open = null;
    }
  }
  if (open) episodes.push(open);
  return episodes;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// "< 1 min", "3 min", "1 h 20 min", "2 dias".
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${String(minutes % 60).padStart(2, "0")} min` : `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} dia${days === 1 ? "" : "s"}`;
}

// --- Números da tela ------------------------------------------------------------

// Quem respondeu pelo celular pareado (sem atendente logado no CRM).
export const PHONE_AGENT = "celular";

export type AgentMetrics = {
  id: string; // id do usuário ou PHONE_AGENT
  name: string;
  conversations: number; // clientes atendidos (conversas com resposta dele no período)
  sent: number;
  resolved: number;
  medianResponseMs: number | null;
  transfers: number;
  assignedNow: number;
  ratingAvg: number | null;
  ratingCount: number;
};

export type SupportMetrics = {
  start: Date;
  waitingNow: number;
  assignedNow: number;
  overdueNow: number;
  conversationsServed: number;
  newConversations: number;
  resolved: number;
  received: number;
  sent: number;
  medianResponseMs: number | null;
  answeredWithinHourPct: number | null;
  ratingAvg: number | null;
  ratingCount: number;
  agents: AgentMetrics[];
};

// Quanto antes do período ainda carrega mensagens: pra saber se o cliente que
// escreveu no primeiro dia já vinha esperando de antes (aí não conta).
const LOOKBACK_MS = 7 * 86_400_000;

export async function loadSupportMetrics(period: MetricsPeriod, now = new Date()): Promise<SupportMetrics> {
  const start = periodStart(period, now);
  const since = { gte: start };

  const [messages, newConversations, resolvedBy, transfersBy, ratingsBy, assignedBy, openConversations] =
    await Promise.all([
      prisma.message.findMany({
        where: { deletedAt: null, createdAt: { gte: new Date(start.getTime() - LOOKBACK_MS) } },
        orderBy: [{ conversationId: "asc" }, { createdAt: "asc" }],
        select: {
          conversationId: true,
          direction: true,
          body: true,
          originalBody: true,
          mediaType: true,
          createdAt: true,
          senderId: true,
        },
      }),
      prisma.conversation.count({ where: { createdAt: since } }),
      prisma.conversation.groupBy({ by: ["resolvedById"], where: { resolvedAt: since }, _count: { _all: true } }),
      prisma.conversationTransfer.groupBy({ by: ["byUserId"], where: { createdAt: since }, _count: { _all: true } }),
      prisma.rating.groupBy({ by: ["agentId"], where: { createdAt: since }, _avg: { score: true }, _count: { _all: true } }),
      prisma.conversation.groupBy({ by: ["assignedToId"], where: { status: "OPEN" }, _count: { _all: true } }),
      prisma.conversation.findMany({
        where: { status: "OPEN" },
        select: {
          id: true,
          status: true,
          assignedToId: true,
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { direction: true, body: true, mediaType: true },
          },
        },
      }),
    ]);

  const inPeriod = (d: Date) => d.getTime() >= start.getTime();
  const agentKey = (senderId: string | null) => senderId ?? PHONE_AGENT;

  // Mensagens e clientes atendidos (por quem respondeu).
  let received = 0;
  let sent = 0;
  const served = new Set<string>();
  const sentBy = new Map<string, number>();
  const servedBy = new Map<string, Set<string>>();
  for (const m of messages) {
    if (!inPeriod(m.createdAt)) continue;
    if (m.direction === "IN") {
      received++;
      continue;
    }
    if (isRatingPrompt(m)) continue;
    sent++;
    served.add(m.conversationId);
    const key = agentKey(m.senderId);
    sentBy.set(key, (sentBy.get(key) ?? 0) + 1);
    if (!servedBy.has(key)) servedBy.set(key, new Set());
    servedBy.get(key)!.add(m.conversationId);
  }

  // Tempo de resposta: só as esperas que começaram no período e foram respondidas.
  const answered = responseEpisodes(messages).filter((e) => inPeriod(e.askedAt) && e.answeredAt);
  const waitMs = (e: ResponseEpisode) => e.answeredAt!.getTime() - e.askedAt.getTime();
  const waitsBy = new Map<string, number[]>();
  for (const e of answered) {
    const key = agentKey(e.answeredBy);
    if (!waitsBy.has(key)) waitsBy.set(key, []);
    waitsBy.get(key)!.push(waitMs(e));
  }

  const resolvedMap = new Map(resolvedBy.map((r) => [r.resolvedById, r._count._all]));
  const transfersMap = new Map(transfersBy.map((t) => [t.byUserId, t._count._all]));
  const ratingsMap = new Map(ratingsBy.map((r) => [r.agentId, r]));
  const assignedMap = new Map(assignedBy.map((a) => [a.assignedToId, a._count._all]));

  // Entra no ranking quem fez alguma coisa no período ou está com cliente agora.
  const ids = new Set<string>([
    ...sentBy.keys(),
    ...[...resolvedMap.keys(), ...transfersMap.keys(), ...ratingsMap.keys(), ...assignedMap.keys()].filter(
      (id): id is string => Boolean(id)
    ),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: [...ids].filter((id) => id !== PHONE_AGENT) } },
    select: { id: true, name: true },
  });
  const names = new Map(users.map((u) => [u.id, u.name]));

  const agents: AgentMetrics[] = [...ids]
    .filter((id) => id === PHONE_AGENT || names.has(id))
    .map((id) => {
      const rating = id === PHONE_AGENT ? undefined : ratingsMap.get(id);
      return {
        id,
        name: id === PHONE_AGENT ? "Pelo celular" : names.get(id)!,
        conversations: servedBy.get(id)?.size ?? 0,
        sent: sentBy.get(id) ?? 0,
        resolved: id === PHONE_AGENT ? 0 : (resolvedMap.get(id) ?? 0),
        medianResponseMs: median(waitsBy.get(id) ?? []),
        transfers: id === PHONE_AGENT ? 0 : (transfersMap.get(id) ?? 0),
        assignedNow: id === PHONE_AGENT ? 0 : (assignedMap.get(id) ?? 0),
        ratingAvg: rating?._avg.score ?? null,
        ratingCount: rating?._count._all ?? 0,
      };
    })
    // Quem mais atendeu primeiro; "Pelo celular" sempre por último (não é uma
    // pessoa da equipe).
    .sort(
      (a, b) =>
        Number(a.id === PHONE_AGENT) - Number(b.id === PHONE_AGENT) ||
        b.conversations - a.conversations ||
        b.sent - a.sent ||
        b.resolved - a.resolved
    );

  const ratingCount = ratingsBy.reduce((s, r) => s + r._count._all, 0);
  const ratingSum = ratingsBy.reduce((s, r) => s + (r._avg.score ?? 0) * r._count._all, 0);
  const waits = answered.map(waitMs);

  return {
    start,
    waitingNow: openConversations.filter((c) => !c.assignedToId).length,
    assignedNow: openConversations.filter((c) => c.assignedToId).length,
    overdueNow: overdueConversations(await withWaitingSince(openConversations), now).length,
    conversationsServed: served.size,
    newConversations,
    resolved: resolvedBy.reduce((s, r) => s + r._count._all, 0),
    received,
    sent,
    medianResponseMs: median(waits),
    answeredWithinHourPct: waits.length ? Math.round((waits.filter((w) => w <= 3_600_000).length / waits.length) * 100) : null,
    ratingAvg: ratingCount ? ratingSum / ratingCount : null,
    ratingCount,
    agents,
  };
}
