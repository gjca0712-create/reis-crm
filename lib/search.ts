import Fuse from "fuse.js";
import type { Product } from "./types";

// Única dependência nova do projeto: busca com tolerância a erro de digitação sobre
// ~60 produtos. Filtros exatos (categoria/marca/preço/estoque) continuam sem lib, em catalog.ts.
export type SearchableProduct = Product & { categoryName: string; brandName: string };

const SEARCH_KEYS = [
  { name: "name", weight: 0.5 },
  { name: "categoryName", weight: 0.2 },
  { name: "brandName", weight: 0.15 },
  { name: "subcategory", weight: 0.15 },
];

export function buildSearchIndex(products: SearchableProduct[]) {
  return new Fuse(products, {
    keys: SEARCH_KEYS,
    threshold: 0.35,
    ignoreLocation: true,
  });
}

export function searchProducts(
  index: Fuse<SearchableProduct>,
  query: string
): SearchableProduct[] {
  if (!query.trim()) return [];
  return index.search(query).map((result) => result.item);
}
