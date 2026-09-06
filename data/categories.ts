// Categorias reais do site atual: Básico, Acabamento, Elétrica, Hidráulica, Ferramentas.
// "Fundação" e "Tintas" são propostas novas do briefing (não existiam no site atual) —
// separadas de "Básico" para não sobrepor (Básico = cimento/areia/brita/blocos;
// Fundação = ferragens estruturais/impermeabilizantes). Ver checklist no README.
import type { Category } from "@/lib/types";

export const categories: Category[] = [
  {
    slug: "basico",
    name: "Básico",
    description: "Cimento, areia, brita, blocos e tijolos: a base de qualquer obra.",
    icon: "basico",
  },
  {
    slug: "acabamento",
    name: "Acabamento",
    description: "Revestimentos, pisos, argamassas e louças para o toque final.",
    icon: "acabamento",
  },
  {
    slug: "eletrica",
    name: "Elétrica",
    description: "Fios, cabos, disjuntores e iluminação para uma instalação segura.",
    icon: "eletrica",
  },
  {
    slug: "hidraulica",
    name: "Hidráulica",
    description: "Tubos, conexões, registros e caixas d'água de marcas confiáveis.",
    icon: "hidraulica",
  },
  {
    slug: "ferramentas",
    name: "Ferramentas",
    description: "Ferramentas manuais, elétricas e equipamentos de proteção individual.",
    icon: "ferramentas",
  },
  {
    slug: "fundacao",
    name: "Fundação",
    description: "Ferragens estruturais e impermeabilizantes para uma base sólida.",
    icon: "fundacao",
  },
  {
    slug: "tintas",
    name: "Tintas",
    description: "Tintas látex, esmalte e acessórios de pintura das melhores marcas.",
    icon: "tintas",
  },
];

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}
