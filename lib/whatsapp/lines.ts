// As duas linhas de WhatsApp da loja. Os números são "intercambiáveis" (mesmo
// tipo de atendimento, só dividem volume): o inbox é único e cada conversa fica
// marcada com a linha que a recebeu — a resposta do atendente sai sempre pela
// mesma linha. Pra trocar os rótulos que aparecem na tela, é só editar aqui.
export const WHATSAPP_LINES = [
  { id: "linha-1", label: "Linha 1" },
  { id: "linha-2", label: "Linha 2" },
] as const;

export type WhatsAppLineId = (typeof WHATSAPP_LINES)[number]["id"];

export const WHATSAPP_LINE_IDS = WHATSAPP_LINES.map((l) => l.id) as WhatsAppLineId[];

// Linha assumida quando a origem é desconhecida (conversas antigas antes do
// multi-linha, webhook do Bradial que não diz por qual número entrou).
export const DEFAULT_WHATSAPP_LINE: WhatsAppLineId = "linha-1";

export function whatsappLineLabel(id: string): string {
  return WHATSAPP_LINES.find((l) => l.id === id)?.label ?? id;
}

export function isWhatsAppLineId(value: string): value is WhatsAppLineId {
  return (WHATSAPP_LINE_IDS as string[]).includes(value);
}

export function toWhatsAppLineId(value: string | null | undefined): WhatsAppLineId {
  return value && isWhatsAppLineId(value) ? value : DEFAULT_WHATSAPP_LINE;
}
