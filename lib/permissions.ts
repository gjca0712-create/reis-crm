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
  | "atendentes"
  | "avaliacoes"
  | "ocorrencias"
  | "leads";

export const FEATURE_LABELS: Record<Feature, string> = {
  dashboard: "Dashboard (faturamento)",
  clientes: "Clientes",
  indicadores: "Indicadores",
  vendas: "Vendas",
  bairros: "Bairros",
  whatsapp_suporte: "WhatsApp Suporte",
  whatsapp_campanhas: "WhatsApp Campanhas",
  atendentes: "Atendentes (gestão de equipe)",
  avaliacoes: "Avaliações",
  ocorrencias: "Ocorrências",
  leads: "Leads (site)",
};

// "atendentes" (criar usuário, editar permissões de outros) nunca entra na
// grade de personalização — se pudesse ser concedida, um usuário promovido
// viraria um "CEO disfarçado", capaz de criar contas e se auto-promover.
// Essa tela continua travada em requireCeo() (checagem de role, não de feature).
export const CEO_ONLY_FEATURES: Feature[] = ["atendentes"];

export const CUSTOMIZABLE_FEATURES: Feature[] = (Object.keys(FEATURE_LABELS) as Feature[]).filter(
  (f) => !CEO_ONLY_FEATURES.includes(f)
);

// Lista padrão de cada papel — usada (a) quando o usuário nunca foi
// personalizado (featureOverrides null) e (b) como ponto de partida sugerido
// ao personalizar um usuário pela primeira vez.
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
    return Array.from(new Set([...base, ...CEO_ONLY_FEATURES]));
  }
  return base.filter((f) => !CEO_ONLY_FEATURES.includes(f));
}

export function canAccess(features: Feature[], feature: Feature): boolean {
  return features.includes(feature);
}

// Primeira tela útil pra cada usuário depois do login / quando ele bate numa
// página que não pode ver. "atendentes" por último: é o único caminho que o
// CEO tem garantido sempre (ver resolveFeatures), evitando um loop de redirect.
export function defaultRouteFor(features: Feature[]): string {
  if (features.includes("dashboard")) return "/admin/dashboard";
  if (features.includes("clientes")) return "/admin/clientes";
  if (features.includes("atendentes")) return "/admin/atendentes";
  return "/admin/login";
}
