import type { Product } from "./types";

export type CatalogFilters = {
  categorySlug?: string;
  brandSlug?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
};

export function filterProducts(products: Product[], filters: CatalogFilters): Product[] {
  return products.filter((product) => {
    if (filters.categorySlug && product.categorySlug !== filters.categorySlug) return false;
    if (filters.brandSlug && product.brandSlug !== filters.brandSlug) return false;
    if (filters.minPrice !== undefined && product.price < filters.minPrice) return false;
    if (filters.maxPrice !== undefined && product.price > filters.maxPrice) return false;
    if (filters.inStockOnly && product.stock !== "em-estoque") return false;
    return true;
  });
}

export type SortOption = "relevance" | "price-asc" | "price-desc" | "name";

export function sortProducts(products: Product[], sortBy: SortOption): Product[] {
  const copy = [...products];
  switch (sortBy) {
    case "price-asc":
      return copy.sort((a, b) => a.price - b.price);
    case "price-desc":
      return copy.sort((a, b) => b.price - a.price);
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    case "relevance":
    default:
      return copy;
  }
}

export function getRelatedProducts(product: Product, all: Product[], max = 4): Product[] {
  if (product.relatedSlugs?.length) {
    const bySlug = new Map(all.map((p) => [p.slug, p]));
    const curated = product.relatedSlugs
      .map((slug) => bySlug.get(slug))
      .filter((p): p is Product => Boolean(p));
    if (curated.length > 0) return curated.slice(0, max);
  }
  return all
    .filter((p) => p.categorySlug === product.categorySlug && p.slug !== product.slug)
    .slice(0, max);
}

export function priceRangeOf(products: Product[]): { min: number; max: number } {
  if (products.length === 0) return { min: 0, max: 0 };
  const prices = products.map((p) => p.price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
