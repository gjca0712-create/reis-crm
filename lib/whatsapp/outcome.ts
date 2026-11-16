// Resultado do atendimento (Conversation.outcome): o atendente marca na
// conversa se o cliente comprou, pediu orçamento ou só tirou uma dúvida — e o
// relatório em Métricas mostra quem mais vendeu e com o que a loja está lidando.
// Sem dependência de servidor: usado pela tela, pela action e pelo relatório.

export const CONVERSATION_OUTCOMES = [
  { id: "VENDA", label: "Venda", plural: "Vendas", hint: "O cliente comprou", color: "#2DB89D" },
  { id: "ORCAMENTO", label: "Orçamento", plural: "Orçamentos", hint: "O cliente pediu orçamento", color: "#F08C4B" },
  { id: "INFORMACAO", label: "Informação", plural: "Informações", hint: "O cliente só tirou uma dúvida", color: "#B48CF2" },
] as const;
// As três cores foram escolhidas pra se distinguirem também pra quem é
// daltônico (e com o mesmo brilho, nenhuma "grita" mais que as outras).
// "Sem marcação" é cinza: não é um resultado, é a falta dele.
export const UNMARKED_COLOR = "#8F8471";

export type ConversationOutcome = (typeof CONVERSATION_OUTCOMES)[number]["id"];
export type OutcomeInfo = (typeof CONVERSATION_OUTCOMES)[number];

export function isConversationOutcome(value: unknown): value is ConversationOutcome {
  return CONVERSATION_OUTCOMES.some((o) => o.id === value);
}

export function outcomeInfo(value: string | null | undefined): OutcomeInfo | null {
  return CONVERSATION_OUTCOMES.find((o) => o.id === value) ?? null;
}

export type OutcomeCounts = Record<ConversationOutcome, number>;

export function emptyOutcomeCounts(): OutcomeCounts {
  return { VENDA: 0, ORCAMENTO: 0, INFORMACAO: 0 };
}

export function outcomeTotal(counts: OutcomeCounts): number {
  return counts.VENDA + counts.ORCAMENTO + counts.INFORMACAO;
}
