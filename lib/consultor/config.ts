// Configuração do Consultor IA. Trocar de modelo = mudar CONSULTOR_MODEL (e
// conferir se o preço dele está em PRECOS_POR_MTOK, senão o custo da tela sai
// com o preço do Sonnet).
export const CONSULTOR_MODEL = "claude-sonnet-5-5";

// "medium": pergunta de gestão costuma pedir 2 a 5 consultas encadeadas — é o
// ponto de partida recomendado pra uso de ferramentas em várias etapas.
export const CONSULTOR_EFFORT = "medium" as const;

// Inclui o raciocínio interno do modelo, que também conta aqui.
export const CONSULTOR_MAX_TOKENS = 32_000;

// Idas e voltas com as ferramentas numa mesma resposta. Pergunta normal usa 2 a
// 4; o teto só segura um caso que entrou em laço.
export const CONSULTOR_MAX_ITERACOES = 12;

// Conversa longa é onde a IA começa a se perder: depois disso a tela pede uma
// conversa nova. Pras perguntas seguintes vão só as últimas trocas, em texto.
export const MAX_PERGUNTAS_POR_CONVERSA = 20;
export const TROCAS_NO_HISTORICO = 10;

export const PERGUNTA_MAX_CARACTERES = 2000;
export const SOBRE_EMPRESA_MAX_CARACTERES = 3000;

// US$ por milhão de tokens. Escrita de cache = 1,25× a entrada (cache de 5 min).
// O custo usa o modelo que a API diz que respondeu (response.model), por isso a
// tabela tem mais de um.
type Preco = { entrada: number; saida: number; cacheEscrita: number; cacheLeitura: number };
const PRECOS_POR_MTOK: Record<string, Preco> = {
  "claude-sonnet-5-5": { entrada: 2, saida: 10, cacheEscrita: 2.5, cacheLeitura: 0.2 },
  "claude-sonnet-5": { entrada: 2, saida: 10, cacheEscrita: 2.5, cacheLeitura: 0.2 },
  "claude-opus-5-5": { entrada: 4, saida: 20, cacheEscrita: 5, cacheLeitura: 0.2 },
};

export type UsoTokens = { entrada: number; saida: number; cacheEscrita: number; cacheLeitura: number };

export function custoUsd(modelo: string, uso: UsoTokens): number {
  const p = PRECOS_POR_MTOK[modelo] ?? PRECOS_POR_MTOK[CONSULTOR_MODEL];
  return (
    (uso.entrada * p.entrada + uso.saida * p.saida + uso.cacheEscrita * p.cacheEscrita + uso.cacheLeitura * p.cacheLeitura) /
    1_000_000
  );
}
