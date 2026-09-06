import type { Role } from "./constants";

// Cada tela do CRM é uma "feature". O que cada papel enxerga é decidido só
// aqui — só o CEO tem acesso a tudo; os demais papéis têm um subconjunto.
export type Feature =
  | "dashboard"
  | "clientes"
  | "indicadores"
  | "vendas"
  | "bairros"
  | "whatsapp_suporte"
  | "whatsapp_campanhas"
  | "atendentes"
  | "avaliacoes"
  | "ocorrencias"
  | "leads";

const ROLE_FEATURES: Record<Role, Feature[]> = {
  CEO: [
    "dashboard",
    "clientes",
    "indicadores",
    "vendas",
    "bairros",
    "whatsapp_suporte",
    "whatsapp_campanhas",
    "atendentes",
    "avaliacoes",
    "ocorrencias",
    "leads",
  ],
  // Visão operacional completa do negócio, mas sem faturamento (Dashboard) nem
  // gestão de equipe (contratar atendente, ver avaliação individual) — isso
  // fica só com o CEO.
  GERENTE: [
    "clientes",
    "indicadores",
    "vendas",
    "bairros",
    "whatsapp_suporte",
    "whatsapp_campanhas",
    "ocorrencias",
    "leads",
  ],
  // Foco em vender: cliente, indicador (pra atrelar a venda), a própria venda,
  // orçamentos pedidos no site (leads) e ocorrências que acontecem na ponta.
  VENDEDOR: ["clientes", "indicadores", "vendas", "ocorrencias", "leads"],
  // Foco em atendimento: cliente (consulta), o inbox do WhatsApp e registrar
  // ocorrências que chegam via reclamação/entrega direto pro atendente.
  ATENDENTE: ["clientes", "whatsapp_suporte", "ocorrencias"],
};

export function canAccess(role: Role, feature: Feature): boolean {
  return ROLE_FEATURES[role]?.includes(feature) ?? false;
}

// Primeira tela útil pra cada papel depois do login / quando ele bate numa
// página que não pode ver.
export function defaultRouteFor(role: Role): string {
  if (canAccess(role, "dashboard")) return "/admin/dashboard";
  return "/admin/clientes";
}
