import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Chat interno da equipe (/admin/chat-interno): um canal "geral" com todo
// mundo e conversa privada entre duas pessoas. Canal privado =
// "dm:<idMenor>:<idMaior>" — os dois ids em ordem, pra cada par ter um canal só.
export const GENERAL_CHANNEL = "geral";
export const TEAM_MESSAGE_MAX = 2000;

export function dmChannel(a: string, b: string): string {
  return `dm:${[a, b].sort().join(":")}`;
}

// Canal que a tela abre: "geral" ou o id de um colega (?c= na URL). null =
// destino inválido (o próprio usuário, ou alguém que não existe).
export async function resolveTeamChannel(userId: string, target: string | undefined): Promise<
  { channel: string; other: { id: string; name: string; role: string } | null } | null
> {
  if (!target || target === GENERAL_CHANNEL) return { channel: GENERAL_CHANNEL, other: null };
  if (target === userId) return null;
  const other = await prisma.user.findUnique({ where: { id: target }, select: { id: true, name: true, role: true } });
  return other ? { channel: dmChannel(userId, other.id), other } : null;
}

export async function sendTeamMessage(
  userId: string,
  target: string,
  rawBody: string
): Promise<{ ok: true; channel: string } | { error: string }> {
  const body = rawBody.trim();
  if (!body) return { error: "Mensagem vazia." };
  if (body.length > TEAM_MESSAGE_MAX) return { error: `Mensagem muito longa (máximo ${TEAM_MESSAGE_MAX} letras).` };
  const resolved = await resolveTeamChannel(userId, target);
  if (!resolved) return { error: "Conversa inválida." };
  await prisma.teamMessage.create({ data: { channel: resolved.channel, senderId: userId, body } });
  // Quem manda já leu tudo até aqui.
  await markTeamChannelRead(userId, resolved.channel);
  return { ok: true, channel: resolved.channel };
}

export async function markTeamChannelRead(userId: string, channel: string): Promise<void> {
  const now = new Date();
  await prisma.teamChatRead.upsert({
    where: { userId_channel: { userId, channel } },
    create: { userId, channel, lastReadAt: now },
    update: { lastReadAt: now },
  });
}

// Não lidas por canal (só os canais da pessoa: o geral e os privados dela).
// Sem registro de leitura, conta só o que chegou depois que o usuário foi
// criado — quem entra na equipe não começa com o histórico todo "não lido".
export async function teamUnreadByChannel(userId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ channel: string; unread: number }[]>(Prisma.sql`
    SELECT m."channel", COUNT(*)::int AS "unread"
    FROM "TeamMessage" m
    JOIN "User" u ON u."id" = ${userId}
    LEFT JOIN "TeamChatRead" r ON r."userId" = ${userId} AND r."channel" = m."channel"
    WHERE m."senderId" <> ${userId}
      AND (m."channel" = ${GENERAL_CHANNEL}
           OR m."channel" LIKE ${`dm:${userId}:%`}
           OR m."channel" LIKE ${`dm:%:${userId}`})
      AND m."createdAt" > COALESCE(r."lastReadAt", u."createdAt")
    GROUP BY m."channel"
  `);
  return new Map(rows.map((r) => [r.channel, r.unread]));
}

export async function teamUnreadTotal(userId: string): Promise<number> {
  let total = 0;
  for (const n of (await teamUnreadByChannel(userId)).values()) total += n;
  return total;
}

export type TeamChannelItem = {
  // "geral" ou o id do colega (o que vai no ?c=).
  target: string;
  channel: string;
  label: string;
  role: string | null;
  last: { body: string; createdAt: Date; senderId: string; senderName: string } | null;
  unread: number;
};

// Lista da esquerda: Geral primeiro, depois os colegas com conversa (mais
// recente em cima) e por fim os que ainda não têm conversa, em ordem alfabética.
export async function listTeamChannels(userId: string): Promise<TeamChannelItem[]> {
  const colleagues = await prisma.user.findMany({
    where: { id: { not: userId } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  const items = [
    { target: GENERAL_CHANNEL, channel: GENERAL_CHANNEL, label: "Geral (toda a equipe)", role: null },
    ...colleagues.map((c) => ({ target: c.id, channel: dmChannel(userId, c.id), label: c.name, role: c.role })),
  ];
  const channels = items.map((i) => i.channel);

  const [lastRows, unread] = await Promise.all([
    prisma.$queryRaw<{ channel: string; body: string; createdAt: Date; senderId: string; senderName: string }[]>(
      Prisma.sql`
        SELECT DISTINCT ON (m."channel") m."channel", m."body", m."createdAt", m."senderId", u."name" AS "senderName"
        FROM "TeamMessage" m
        JOIN "User" u ON u."id" = m."senderId"
        WHERE m."channel" IN (${Prisma.join(channels)})
        ORDER BY m."channel", m."createdAt" DESC
      `
    ),
    teamUnreadByChannel(userId),
  ]);
  const lastByChannel = new Map(lastRows.map((r) => [r.channel, r]));

  const withData: TeamChannelItem[] = items.map((i) => {
    const last = lastByChannel.get(i.channel);
    return {
      ...i,
      last: last ? { body: last.body, createdAt: last.createdAt, senderId: last.senderId, senderName: last.senderName } : null,
      unread: unread.get(i.channel) ?? 0,
    };
  });
  const [general, ...dms] = withData;
  dms.sort((a, b) => {
    if (a.last && b.last) return b.last.createdAt.getTime() - a.last.createdAt.getTime();
    if (a.last) return -1;
    if (b.last) return 1;
    return a.label.localeCompare(b.label, "pt-BR");
  });
  return [general, ...dms];
}

// Mensagens do canal aberto (as últimas 300, da mais velha pra mais nova).
export async function teamChannelMessages(channel: string) {
  const rows = await prisma.teamMessage.findMany({
    where: { channel },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { sender: { select: { id: true, name: true } } },
  });
  return rows.reverse();
}
