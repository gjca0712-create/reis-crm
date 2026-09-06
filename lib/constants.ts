export const CASHBACK_RATE = 0.03;
export const POINTS_PER_REAL = 0.1;

// SQLite has no native enum type (see prisma/schema.prisma), so these columns
// are plain strings in the DB — these unions are the app-level constraint.
export type Profissao = "PEDREIRO" | "ELETRICISTA" | "ENCANADOR" | "PINTOR" | "MARCENEIRO" | "ARQUITETO" | "ENGENHEIRO" | "OUTRO";
export type Role = "CEO" | "GERENTE" | "VENDEDOR" | "ATENDENTE";
export type FaseObra = "INICIO" | "MEIO" | "FIM";
export type DeliveryStatus = "SEPARACAO" | "EM_ROTA" | "ENTREGUE";
export type OccurrenceType =
  | "SEM_ESTOQUE"
  | "SEPARACAO_ERRADA"
  | "ENTREGA_ERRADA"
  | "ENDERECO_INCOMPLETO"
  | "PRODUTO_DANIFICADO"
  | "DEVOLUCAO"
  | "CANCELAMENTO"
  | "RECLAMACAO_CLIENTE";
export type LeadStatus = "NOVO" | "CONTATADO" | "CONVERTIDO" | "PERDIDO";

export const PROFISSAO_LABELS: Record<string, string> = {
  PEDREIRO: "Pedreiro",
  ELETRICISTA: "Eletricista",
  ENCANADOR: "Encanador",
  PINTOR: "Pintor",
  MARCENEIRO: "Marceneiro",
  ARQUITETO: "Arquiteto",
  ENGENHEIRO: "Engenheiro",
  OUTRO: "Outro",
};

export const ROLE_LABELS: Record<string, string> = {
  CEO: "CEO",
  GERENTE: "Gerente",
  VENDEDOR: "Vendedor",
  ATENDENTE: "Atendente",
};

export const FASE_OBRA_LABELS: Record<string, string> = {
  INICIO: "Início da obra",
  MEIO: "Meio da obra",
  FIM: "Acabamento",
};

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  SEPARACAO: "Em separação",
  EM_ROTA: "Saiu para entrega",
  ENTREGUE: "Entregue",
};

export const OCCURRENCE_TYPE_LABELS: Record<string, string> = {
  SEM_ESTOQUE: "Produto vendido sem estoque",
  SEPARACAO_ERRADA: "Separação errada",
  ENTREGA_ERRADA: "Entrega errada",
  ENDERECO_INCOMPLETO: "Endereço incompleto",
  PRODUTO_DANIFICADO: "Produto danificado",
  DEVOLUCAO: "Devolução",
  CANCELAMENTO: "Cancelamento",
  RECLAMACAO_CLIENTE: "Reclamação de cliente",
};

export const LEAD_STATUS_LABELS: Record<string, string> = {
  NOVO: "Novo",
  CONTATADO: "Contatado",
  CONVERTIDO: "Convertido",
  PERDIDO: "Perdido",
};

export const BAIRROS_PADRAO = [
  "Setor Bueno",
  "Setor Marista",
  "Jardim América",
  "Vila Nova",
  "Campinas",
  "Setor Sul",
  "Jardim Goiás",
  "Parque Amazônia",
  "Setor Coimbra",
  "Residencial Eldorado",
];
