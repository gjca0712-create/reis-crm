import { prisma } from "@/lib/prisma";
import { formatPhone, onlyDigits } from "@/lib/format";
import { normalizePhone, phoneVariants } from "@/lib/phone";
import { checkWhatsAppNumber, isSendablePhone } from "./client";
import { findCustomerByPhone, withPhoneLock } from "./inbound";
import { isWhatsAppLineId, whatsappLineLabel } from "./lines";
import { sendWhatsAppMessage } from "./send";
import { agentName, signAgentMessage } from "./signature";

// Iniciar conversa pelo CRM. Até aqui conversa só nascia quando o cliente
// escrevia primeiro. "Nova conversa" (WhatsApp Suporte) manda a primeira
// mensagem por uma das linhas e já deixa a conversa com quem mandou (Em
// atendimento). Uma de cada vez, texto escrito pelo atendente — disparo pra
// vários é a tela de Campanhas. As server actions (suporte/actions.ts) só
// conferem a permissão e chamam daqui.

export type ChatCustomerOption = { id: string; name: string; phone: string };

// Busca do "Nova conversa": nome, ou telefone (parte dele, ou inteiro com ou
// sem o nono dígito).
export async function searchCustomersForChat(query: string): Promise<ChatCustomerOption[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const digits = normalizePhone(onlyDigits(q));
  return prisma.customer.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 4 ? [{ phone: { contains: digits } }, { phone: { in: phoneVariants(digits) } }] : []),
      ],
    },
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
    take: 8,
  });
}

// Sem redirect: o formulário fica num <dialog> e, dando errado, precisa
// continuar aberto com o texto digitado. A tela abre a conversa ao receber o id.
export type StartConversationResult = { error: string } | { conversationId: string } | undefined;

export type StartConversationInput = {
  // Cliente escolhido na busca; sem ele, phone (+ name) é um contato novo.
  customerId?: string;
  phone?: string;
  name?: string;
  line: string;
  body: string;
};

export async function startConversationAs(
  userId: string,
  input: StartConversationInput
): Promise<StartConversationResult> {
  const { line } = input;
  const body = input.body.trim();
  if (!isWhatsAppLineId(line)) return { error: "Escolha por qual linha mandar." };
  if (!body) return { error: "Escreva a mensagem." };

  const chosen = input.customerId ? await prisma.customer.findUnique({ where: { id: input.customerId } }) : null;
  if (input.customerId && !chosen) return { error: "Esse cliente não foi encontrado — busque de novo." };
  const phone = chosen?.phone ?? normalizePhone(input.phone);
  if (!isSendablePhone(phone)) {
    return { error: "Telefone inválido. Use DDD + número, ex.: (75) 99999-8888 — e corrija o cadastro se for o caso." };
  }

  const check = await checkWhatsAppNumber(line, phone);
  if (check === "offline") {
    return { error: `A ${whatsappLineLabel(line)} está desconectada. Conecte acima ou mande pela outra linha.` };
  }
  if (check === "not-on-whatsapp") return { error: `O número ${formatPhone(phone)} não tem WhatsApp.` };

  // Travado pelo telefone, igual à mensagem recebida: se o cliente responder
  // enquanto isso grava, a resposta espera e cai nesta conversa (não abre outra).
  return withPhoneLock(phone, async (): Promise<StartConversationResult> => {
    // Telefone digitado de alguém já cadastrado (com ou sem o nono dígito):
    // usa o cadastro que existe em vez de duplicar.
    const customer = chosen ?? (await findCustomerByPhone(phone));

    // Pelo telefone e não pelo cadastro: um duplicado (com/sem o nono dígito)
    // é a mesma conversa no WhatsApp.
    const open = await prisma.conversation.findMany({
      where: { status: "OPEN", customer: { phone: { in: phoneVariants(phone) } } },
      orderBy: { lastMessageAt: "desc" },
      include: { assignedTo: { select: { id: true, name: true } }, customer: { select: { name: true } } },
    });
    // Já com um colega: dois atendentes falando com o mesmo cliente confunde
    // ele (e o colega nem vê). CEO/Gerente passam a conversa pela visão Equipe.
    const heldByOther = open.find((c) => c.assignedTo && c.assignedTo.id !== userId);
    if (heldByOther?.assignedTo) {
      return {
        error: `${heldByOther.customer.name} já está em atendimento com ${heldByOther.assignedTo.name} (${whatsappLineLabel(heldByOther.line)}).`,
      };
    }

    const result = await sendWhatsAppMessage(
      line,
      { phone, whatsappLid: customer?.whatsappLid },
      signAgentMessage(await agentName(userId), body)
    );
    if (!result.sent) {
      return { error: `A mensagem não saiu pela ${whatsappLineLabel(line)}. Confira a conexão acima e tente de novo.` };
    }

    // Só grava depois que a mensagem saiu — falhando, não fica cliente nem
    // conversa vazia pra trás.
    const saved =
      customer ??
      (await prisma.customer.create({
        data: {
          name: input.name?.trim() || formatPhone(phone),
          phone,
          bairro: "Não informado",
          notes: "Cadastrado ao iniciar uma conversa pelo WhatsApp Suporte.",
        },
      }));
    // Conversa em aberto nessa linha (esperando na fila ou já com a pessoa)
    // continua a mesma; senão abre outra.
    const conversationId =
      open.find((c) => c.line === line)?.id ??
      (await prisma.conversation.create({ data: { customerId: saved.id, line, status: "OPEN" } })).id;

    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          direction: "OUT",
          body,
          senderId: userId,
          waMessageId: result.ref?.id,
          waRemoteJid: result.ref?.remoteJid,
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date(), assignedToId: userId },
      }),
    ]);
    return { conversationId };
  });
}
