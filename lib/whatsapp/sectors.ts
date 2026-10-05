// Setores da loja pra onde uma conversa do WhatsApp Suporte pode ser
// transferida. Cada atendente é colocado num deles (tela Atendentes) e vê na
// fila de espera as conversas sem setor (entrada geral) e as do seu setor —
// ver lib/whatsapp/queue.ts. Pra renomear, é só trocar o label (o id fica
// gravado no banco, não mude).
export const SECTORS = [
  { id: "vendas", label: "Vendas" },
  { id: "financeiro", label: "Financeiro" },
  { id: "entregas", label: "Entregas" },
  { id: "pos-venda", label: "Pós-venda" },
] as const;

export type SectorId = (typeof SECTORS)[number]["id"];

export function isSectorId(value: unknown): value is SectorId {
  return SECTORS.some((s) => s.id === value);
}

// null = conversa na entrada geral / usuário sem setor.
export function sectorLabel(id: string | null | undefined): string {
  if (!id) return "Geral";
  return SECTORS.find((s) => s.id === id)?.label ?? id;
}

// Mínimo de caracteres do motivo da transferência — o setor que recebe precisa
// entender o caso sem perguntar de novo pro cliente.
export const TRANSFER_REASON_MIN = 10;
