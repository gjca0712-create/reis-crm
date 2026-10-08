import type { Role } from "./constants";

// Cada tela do CRM é uma "feature". O ponto de partida é o papel (role), mas
// a partir daqui cada usuário pode ter essa lista personalizada
// (User.featureOverrides) — ver resolveFeatures().
export type Feature =
  | "dashboard"
  | "clientes"
  | "indicadores"
  | "vendas"
  | "bairros"
  | "whatsapp_suporte"
  | "whatsapp_campanhas"
  | "whatsapp_gestao"
  | "atendentes"
  | "avaliacoes"
  | "ocorrencias"
  | "leads"
  | "auditoria"
  | "financeiro"
  | "produtos";

export const FEATURE_LABELS: Record<Feature, string> = {
  dashboard: "Dashboard (faturamento)",
  financeiro: "Financeiro (ERP)",
  produtos: "Produtos (ERP)",
  clientes: "Clientes",
  indicadores: "Indicadores",
  vendas: "Vendas",
  bairros: "Bairros",
  whatsapp_suporte: "WhatsApp Suporte",
  whatsapp_campanhas: "WhatsApp Campanhas",
  whatsapp_gestao: "WhatsApp: métricas e mensagens antigas",
  atendentes: "Atendentes (gestão de equipe)",
  avaliacoes: "Avaliações",
  ocorrencias: "Ocorrências",
  leads: "Leads (site)",
  auditoria: "Auditoria (histórico de ações)",
};

// "atendentes" (criar usuário, editar permissões de outros) e "auditoria"
// (histórico de quem mexeu em quê, inclusive tentativas de login) nunca entram
// na grade de personalização — se pudessem ser concedidas, um usuário
// promovido viraria um "CEO disfarçado", capaz de criar contas, se
// auto-promover e apagar o próprio rastro. Essas telas continuam travadas em
// requireCeo() (checagem de role, não de feature).
export const CEO_ONLY_FEATURES: Feature[] = ["atendentes", "auditoria"];

// Métricas de atendimento e mensagens antigas do WhatsApp: sempre pra CEO e
// Gerente, nunca pra mais ninguém (nem personalizando) — é supervisão da equipe.
export const MANAGER_ONLY_FEATURES: Feature[] = ["whatsapp_gestao"];

export const CUSTOMIZABLE_FEATURES: Feature[] = (Object.keys(FEATURE_LABELS) as Feature[]).filter(
  (f) => !CEO_ONLY_FEATURES.includes(f) && !MANAGER_ONLY_FEATURES.includes(f)
);

// Números do ERP (faturamento, margem, contas a pagar/receber, custo) só pra
// CEO e Gerente — nem personalizando dá pra liberar pra Vendedor/Atendente
// (a grade de permissões nem mostra essas opções pra esses perfis).
export const MANAGEMENT_FEATURES: Feature[] = ["financeiro", "produtos"];
const MANAGEMENT_ROLES: Role[] = ["CEO", "GERENTE"];

export function customizableFeaturesFor(role: Role): Feature[] {
  return MANAGEMENT_ROLES.includes(role)
    ? CUSTOMIZABLE_FEATURES
    : CUSTOMIZABLE_FEATURES.filter((f) => !MANAGEMENT_FEATURES.includes(f));
}

// Lista padrão de cada papel — usada (a) quando o usuário nunca foi
// personalizado (featureOverrides null) e (b) como ponto de partida sugerido
// ao personalizar um usuário pela primeira vez.
const ROLE_FEATURES: Record<Role, Feature[]> = {
  CEO: [
    "dashboard",
    "financeiro",
    "produtos",
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
    "auditoria",
  ],
  GERENTE: [
    "financeiro",
    "produtos",
    "clientes",
    "indicadores",
    "vendas",
    "bairros",
    "whatsapp_suporte",
    "whatsapp_campanhas",
    "ocorrencias",
    "leads",
  ],
  VENDEDOR: ["clientes", "indicadores", "vendas", "ocorrencias", "leads"],
  ATENDENTE: ["clientes", "whatsapp_suporte", "ocorrencias"],
};

export function defaultFeaturesFor(role: Role): Feature[] {
  return ROLE_FEATURES[role] ?? [];
}

function isFeature(value: unknown): value is Feature {
  return typeof value === "string" && value in FEATURE_LABELS;
}

// Resolve a lista efetiva de features de um usuário: personalizada se existir,
// senão a padrão do perfil. CEO sempre mantém "atendentes" (senão ele mesmo
// poderia se trancar pra fora da tela que devolve esse acesso) e ninguém além
// do CEO recebe "atendentes", mesmo que tenha sido salvo por engano.
export function resolveFeatures(role: Role, overrides: unknown): Feature[] {
  const base = Array.isArray(overrides) ? overrides.filter(isFeature) : defaultFeaturesFor(role);

  if (role === "CEO") {
    // Financeiro/Produtos também sempre: telas novas não apareceriam pra um
    // CEO que já tivesse lista personalizada salva de antes delas existirem.
    return Array.from(new Set([...base, ...CEO_ONLY_FEATURES, ...MANAGEMENT_FEATURES, ...MANAGER_ONLY_FEATURES]));
  }
  const withoutCeoOnly = base.filter((f) => !CEO_ONLY_FEATURES.includes(f) && !MANAGER_ONLY_FEATURES.includes(f));
  return MANAGEMENT_ROLES.includes(role)
    ? [...withoutCeoOnly, ...MANAGER_ONLY_FEATURES]
    : withoutCeoOnly.filter((f) => !MANAGEMENT_FEATURES.includes(f));
}

export function canAccess(features: Feature[], feature: Feature): boolean {
  return features.includes(feature);
}

// Primeira tela útil pra cada usuário depois do login / quando ele bate numa
// página que não pode ver. Cada rota aqui é guardada pela própria feature (senão
// vira loop de redirect). "atendentes" por último: é o único caminho que o CEO
// tem garantido sempre (ver resolveFeatures).
const LANDING_ROUTES: [Feature, string][] = [
  ["dashboard", "/admin/dashboard"],
  ["clientes", "/admin/clientes"],
  ["financeiro", "/admin/financeiro"],
  ["produtos", "/admin/produtos"],
  ["vendas", "/admin/vendas"],
  ["indicadores", "/admin/indicadores"],
  ["leads", "/admin/leads"],
  ["ocorrencias", "/admin/ocorrencias"],
  ["whatsapp_suporte", "/admin/whatsapp/suporte"],
  ["whatsapp_campanhas", "/admin/whatsapp/campanhas"],
  ["bairros", "/admin/bairros"],
  ["avaliacoes", "/admin/avaliacoes"],
  ["atendentes", "/admin/atendentes"],
];

export function defaultRouteFor(features: Feature[]): string {
  return LANDING_ROUTES.find(([feature]) => features.includes(feature))?.[1] ?? "/admin/login";
}
