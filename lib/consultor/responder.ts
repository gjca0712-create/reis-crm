import Anthropic from "@anthropic-ai/sdk";
import { CONSULTOR_EFFORT, CONSULTOR_MAX_ITERACOES, CONSULTOR_MAX_TOKENS, CONSULTOR_MODEL, type UsoTokens } from "./config";
import { criarFerramentas, type ConsultaFeita } from "./ferramentas";
import { montarRegrasDoConsultor } from "./regras";
import type { ConsultorRegras } from "./settings";

// O laço da IA com as ferramentas: manda a pergunta, roda as consultas que ela
// pedir, devolve o resultado e repete até ela responder (ou bater o teto de
// voltas). Fica fora da rota pra poder ser testado sem login e sem banco do CRM.

export type Andamento = {
  consultas: ConsultaFeita[];
  uso: UsoTokens;
  modelo: string;
  textosDasVoltas: string[];
  textoFinal: string;
  motivo: string | null;
};

export function novoAndamento(): Andamento {
  return {
    consultas: [],
    uso: { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 },
    modelo: CONSULTOR_MODEL,
    textosDasVoltas: [],
    textoFinal: "",
    motivo: null,
  };
}

// Preenche `andamento` conforme avança: se der erro no meio, quem chamou ainda
// sabe o que já foi gasto e consultado.
export async function responder(opts: {
  regras: ConsultorRegras;
  mensagens: Anthropic.Beta.Messages.BetaMessageParam[];
  andamento: Andamento;
  aoConsultar: (rotulo: string) => void;
  aoEscrever: (delta: string) => void;
  signal: AbortSignal;
  client?: Anthropic;
}): Promise<string> {
  const { andamento: a } = opts;
  const client = opts.client ?? new Anthropic({ maxRetries: 2 });
  const runner = client.beta.messages.toolRunner(
    {
      model: CONSULTOR_MODEL,
      max_tokens: CONSULTOR_MAX_TOKENS,
      output_config: { effort: CONSULTOR_EFFORT },
      // As regras e as ferramentas não mudam entre perguntas: ficam em cache.
      // O cache_control de cima vai pro fim da conversa, pra cada volta com as
      // ferramentas reaproveitar a anterior.
      cache_control: { type: "ephemeral" },
      system: [{ type: "text", text: montarRegrasDoConsultor(opts.regras), cache_control: { type: "ephemeral" } }],
      messages: opts.mensagens,
      tools: criarFerramentas({
        regras: opts.regras,
        consultas: a.consultas,
        aoConsultar: ({ rotulo }) => opts.aoConsultar(rotulo),
      }),
      max_iterations: CONSULTOR_MAX_ITERACOES,
      stream: true,
    },
    { signal: opts.signal }
  );

  for await (const volta of runner) {
    volta.on("text", (delta) => opts.aoEscrever(delta));
    const msg = await volta.finalMessage();
    a.modelo = msg.model;
    a.motivo = msg.stop_reason;
    a.uso.entrada += msg.usage.input_tokens;
    a.uso.saida += msg.usage.output_tokens;
    a.uso.cacheEscrita += msg.usage.cache_creation_input_tokens ?? 0;
    a.uso.cacheLeitura += msg.usage.cache_read_input_tokens ?? 0;
    const texto = msg.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (texto) a.textosDasVoltas.push(texto);
    // Vale o texto da última volta: o que veio antes de uma consulta era só a
    // IA dizendo o que ia olhar.
    a.textoFinal = texto;
  }

  if (a.motivo === "refusal") {
    return "Não posso ajudar com esse pedido. Posso analisar vendas, estoque, clientes, parceiros ou o atendimento da loja.";
  }
  if (a.motivo === "tool_use") {
    // Bateu o teto de voltas ainda pedindo consulta: o texto das voltas era só
    // a IA dizendo o que ia olhar, não serve de resposta.
    return "_A análise precisou de consultas demais e parou no meio. Tente uma pergunta mais específica (um período, um grupo de produtos)._";
  }
  if (a.motivo === "max_tokens") {
    return `${a.textoFinal}\n\n_Resposta cortada por tamanho. Peça uma parte de cada vez._`.trim();
  }
  return a.textoFinal || "Não consegui montar uma resposta. Tente perguntar de outro jeito.";
}
