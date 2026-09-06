// As 4 marcas reais mencionadas no site atual da Reis. Produtos de amostra só recebem
// uma dessas marcas onde plausível (ver data/products.ts) — as demais categorias ficam
// sem marca em vez de inventar um fornecedor/parceria comercial que não existe.
import type { Brand } from "@/lib/types";

export const brands: Brand[] = [
  { slug: "suvinil", name: "Suvinil" },
  { slug: "fortlev", name: "Fortlev" },
  { slug: "elit", name: "Elit" },
  { slug: "g-light", name: "G-Light" },
];

export function getBrandBySlug(slug: string): Brand | undefined {
  return brands.find((b) => b.slug === slug);
}
