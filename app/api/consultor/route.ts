import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, getSessionFeatures } from "@/lib/session";
import { canAccess } from "@/lib/permissions";
import { MAX_PERGUNTAS_POR_CONVERSA, PERGUNTA_MAX_CARACTERES, TROCAS_NO_HISTORICO, custoUsd } from "@/lib/consultor/config";
import type { ConsultaFeita } from "@/lib/consultor/ferramentas";
import { novoAndamento, responder } from "@/lib/consultor/responder";
import { getConsultorRegras } from "@/lib/consultor/settings";
import { inicioDeHoje } from "@/lib/consultor/periodo";

// Uma pergunta ao Consultor IA. A resposta sai aos poucos, em NDJSON (um JSON
// por linha): "ferramenta" a cada consulta que a IA faz, "texto" com os pedaços
// da resposta e, no fim, "fim" (já salva no banco) ou "erro".
//
// Só o texto das trocas anteriores volta pra IA (sem o raciocínio interno nem os
// resultados das consultas): mantém a conversa barata e evita erro de API ao
// reenviar blocos de raciocínio antigos.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type EventoConsultor =
  | { tipo: "ferramenta"; rotulo: string }
  | { tipo: "texto"; delta: string }
  | { tipo: "fim"; conversaId: string; mensagemId: string; texto: string; consultas: ConsultaFeita[] }
  | { tipo: "erro"; mensagem: string };

const entradaSchema = z.object({
  conversaId: z.string().min(1).max(64).optional(),
  pergunta: z.string().trim().min(1, "Escreva a pergunta.").max(PERGUNTA_MAX_CARACTERES, "Pergunta longa demais."),
});

const agoraNaLoja = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Bahia",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function erroJson(mensagem: string, status: number) {
  return NextResponse.json({ erro: mensagem }, { status });
}

// Erros da API da Anthropic em português, com o que fazer.
function mensagemDeErro(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "A chave da IA (ANTHROPIC_API_KEY) é inválida ou foi revogada.";
  if (err instanceof Anthropic.PermissionDeniedError) return "A conta da Anthropic não tem permissão pra esse modelo.";
  if (err instanceof Anthropic.RateLimitError) return "Muitas perguntas seguidas na conta da Anthropic. Espere um minuto e tente de novo.";
  if (err instanceof Anthropic.APIConnectionError) return "Não consegui falar com a IA (falha de conexão). Tente de novo.";
  if (err instanceof Anthropic.APIError) {
    if (/credit|billing|spend|balance/i.test(err.message)) {
      return "A conta da Anthropic ficou sem crédito ou bateu o limite de gasto. Recarregue ou aumente o limite em console.anthropic.com.";
    }
    if (err.status === 529 || (err.status ?? 0) >= 500) return "A IA está sobrecarregada agora. Tente de novo em alguns minutos.";
  }
  return "Algo deu errado ao gerar a resposta. Tente de novo.";
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const features = session ? await getSessionFeatures(session) : [];
  if (!session || !canAccess(features, "consultor")) return erroJson("Não autorizado", 401);

  const parsed = entradaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return erroJson(parsed.error.issues[0]?.message ?? "Pergunta inválida.", 400);
  const { pergunta } = parsed.data;

  if (!process.env.ANTHROPIC_API_KEY) {
    return erroJson("A IA ainda não foi ligada: falta configurar a chave ANTHROPIC_API_KEY no servidor.", 503);
  }

  const regras = await getConsultorRegras();
  const perguntasHoje = await prisma.consultorMessage.count({
    where: { role: "user", createdAt: { gte: inicioDeHoje() }, conversation: { userId: session.userId } },
  });
  if (perguntasHoje >= regras.limiteDiario) {
    return erroJson(`Você chegou ao limite de ${regras.limiteDiario} perguntas por dia. Amanhã libera de novo.`, 429);
  }

  let conversaId = parsed.data.conversaId ?? null;
  const historico: Anthropic.Beta.Messages.BetaMessageParam[] = [];
  if (conversaId) {
    const conversa = await prisma.consultorConversation.findFirst({
      where: { id: conversaId, userId: session.userId },
      select: { id: true, _count: { select: { messages: { where: { role: "user" } } } } },
    });
    if (!conversa) return erroJson("Conversa não encontrada.", 404);
    if (conversa._count.messages >= MAX_PERGUNTAS_POR_CONVERSA) {
      return erroJson("Esta conversa já está longa. Comece uma nova: as respostas saem mais certas.", 400);
    }
    const anteriores = await prisma.consultorMessage.findMany({
      where: { conversationId: conversaId },
      orderBy: { createdAt: "desc" },
      take: TROCAS_NO_HISTORICO * 2,
      select: { role: true, text: true },
    });
    for (const m of anteriores.reverse()) {
      const role = m.role === "assistant" ? "assistant" : "user";
      const ultima = historico[historico.length - 1];
      // A API exige alternar usuário/assistente e começar pelo usuário.
      if (!ultima && role === "assistant") continue;
      if (ultima?.role === role) ultima.content = `${ultima.content}\n\n${m.text}`;
      else historico.push({ role, content: m.text });
    }
    if (historico[historico.length - 1]?.role === "user") historico.pop();
  }

  const mensagens: Anthropic.Beta.Messages.BetaMessageParam[] = [
    ...historico,
    {
      role: "user",
      content: [
        { type: "text", text: `Hoje é ${agoraNaLoja.format(new Date())} (horário da loja).` },
        { type: "text", text: pergunta },
      ],
    },
  ];

  const inicio = new Date();
  const abortar = new AbortController();
  request.signal.addEventListener("abort", () => abortar.abort());
  const encoder = new TextEncoder();
  const andamento = novoAndamento();

  const salvar = async (texto: string) => {
    if (!conversaId) {
      const nova = await prisma.consultorConversation.create({
        data: { userId: session.userId, title: pergunta.replace(/\s+/g, " ").slice(0, 80) },
      });
      conversaId = nova.id;
    }
    const { uso, modelo, consultas } = andamento;
    const [, resposta] = await prisma.$transaction([
      prisma.consultorMessage.create({ data: { conversationId: conversaId, role: "user", text: pergunta, createdAt: inicio } }),
      prisma.consultorMessage.create({
        data: {
          conversationId: conversaId,
          role: "assistant",
          text: texto,
          tools: consultas as unknown as Prisma.InputJsonValue,
          model: modelo,
          inputTokens: uso.entrada,
          outputTokens: uso.saida,
          cacheReadTokens: uso.cacheLeitura,
          cacheWriteTokens: uso.cacheEscrita,
          costUsd: Math.round(custoUsd(modelo, uso) * 1e6) / 1e6,
        },
      }),
      prisma.consultorConversation.update({ where: { id: conversaId }, data: { updatedAt: new Date() } }),
    ]);
    return { conversaId, mensagemId: resposta.id };
  };

  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      abortar.abort();
    },
    async start(controller) {
      const enviar = (e: EventoConsultor) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          // Quem perguntou fechou a tela: segue só pra salvar.
        }
      };

      try {
        const texto = await responder({
          regras,
          mensagens,
          andamento,
          aoConsultar: (rotulo) => enviar({ tipo: "ferramenta", rotulo }),
          aoEscrever: (delta) => enviar({ tipo: "texto", delta }),
          signal: abortar.signal,
        });
        const salvo = await salvar(texto);
        enviar({ tipo: "fim", ...salvo, texto, consultas: andamento.consultas });
      } catch (err) {
        // O que já foi gasto fica registrado, mesmo sem resposta completa.
        const gastou = andamento.uso.saida > 0;
        if (abortar.signal.aborted) {
          const parcial = andamento.textoFinal || andamento.textosDasVoltas.join("\n\n");
          if (gastou) await salvar(`${parcial}\n\n_(resposta interrompida)_`.trim()).catch(() => null);
        } else {
          console.error("[consultor] falha ao responder:", err);
          const mensagem = mensagemDeErro(err);
          if (gastou) await salvar(`_${mensagem}_`).catch(() => null);
          enviar({ tipo: "erro", mensagem });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // já fechado
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
