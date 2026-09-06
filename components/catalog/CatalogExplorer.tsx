"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { categories } from "@/data/categories";
import { brands } from "@/data/brands";
import { filterProducts, sortProducts, priceRangeOf, type SortOption } from "@/lib/catalog";
import { buildSearchIndex, searchProducts, type SearchableProduct } from "@/lib/search";
import ProductCard from "./ProductCard";
import FilterSidebar from "./FilterSidebar";
import SearchBar from "./SearchBar";
import SortSelect from "./SortSelect";
import { FilterIcon } from "@/components/icons";

// Categoria é rota real (/catalogo/[categoria]) por SEO/compartilhamento — trocar de
// categoria navega de verdade. Os demais filtros (marca/preço/estoque/busca) ficam em
// estado client, só espelhados na query string para permitir link compartilhável.
export default function CatalogExplorer({
  products,
  initialCategorySlug,
}: {
  products: Product[];
  initialCategorySlug?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [brandSlug, setBrandSlug] = useState<string | undefined>(
    searchParams.get("marca") ?? undefined
  );
  const [inStockOnly, setInStockOnly] = useState(searchParams.get("estoque") === "1");
  const [sortBy, setSortBy] = useState<SortOption>(
    (searchParams.get("ordenar") as SortOption) || "relevance"
  );
  const [query, setQuery] = useState(searchParams.get("busca") ?? "");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const categoryProducts = useMemo(
    () =>
      initialCategorySlug
        ? products.filter((p) => p.categorySlug === initialCategorySlug)
        : products,
    [products, initialCategorySlug]
  );

  const range = useMemo(() => priceRangeOf(categoryProducts), [categoryProducts]);
  const [minPrice, setMinPrice] = useState<number | undefined>(
    searchParams.get("precoMin") ? Number(searchParams.get("precoMin")) : undefined
  );
  const [maxPrice, setMaxPrice] = useState<number | undefined>(
    searchParams.get("precoMax") ? Number(searchParams.get("precoMax")) : undefined
  );

  useEffect(() => {
    const params = new URLSearchParams();
    if (brandSlug) params.set("marca", brandSlug);
    if (inStockOnly) params.set("estoque", "1");
    if (sortBy !== "relevance") params.set("ordenar", sortBy);
    if (query) params.set("busca", query);
    if (minPrice !== undefined) params.set("precoMin", String(minPrice));
    if (maxPrice !== undefined) params.set("precoMax", String(maxPrice));
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandSlug, inStockOnly, sortBy, query, minPrice, maxPrice, pathname]);

  const searchIndex = useMemo(() => {
    const searchable: SearchableProduct[] = categoryProducts.map((p) => ({
      ...p,
      categoryName: categories.find((c) => c.slug === p.categorySlug)?.name ?? "",
      brandName: brands.find((b) => b.slug === p.brandSlug)?.name ?? "",
    }));
    return buildSearchIndex(searchable);
  }, [categoryProducts]);

  const suggestions = useMemo(
    () => (query.trim() ? searchProducts(searchIndex, query).slice(0, 6) : []),
    [searchIndex, query]
  );

  const filtered = useMemo(() => {
    const base = query.trim() ? searchProducts(searchIndex, query) : categoryProducts;
    const withFilters = filterProducts(base, { brandSlug, minPrice, maxPrice, inStockOnly });
    return sortProducts(withFilters, sortBy);
  }, [categoryProducts, query, searchIndex, brandSlug, minPrice, maxPrice, inStockOnly, sortBy]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-center gap-2 pb-8">
        <Link
          href="/catalogo"
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            !initialCategorySlug
              ? "bg-primary-container text-on-primary-container"
              : "bg-surface-container text-on-background hover:bg-surface-bright"
          }`}
        >
          Todas
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat.slug}
            href={`/catalogo/${cat.slug}`}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              initialCategorySlug === cat.slug
                ? "bg-primary-container text-on-primary-container"
                : "bg-surface-container text-on-background hover:bg-surface-bright"
            }`}
          >
            {cat.name}
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <FilterSidebar
          className="hidden lg:block"
          brandSlug={brandSlug}
          onBrandChange={setBrandSlug}
          inStockOnly={inStockOnly}
          onInStockChange={setInStockOnly}
          minPrice={minPrice}
          maxPrice={maxPrice}
          priceBounds={range}
          onPriceChange={(min, max) => {
            setMinPrice(min);
            setMaxPrice(max);
          }}
        />

        <div className="min-w-0 flex-1">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <SearchBar query={query} onQueryChange={setQuery} suggestions={suggestions} />
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="flex items-center gap-2 rounded-full border border-outline-variant/30 px-4 py-2 text-sm font-semibold text-on-background lg:hidden"
              >
                <FilterIcon className="h-4 w-4" />
                Filtros
              </button>
              <SortSelect value={sortBy} onChange={setSortBy} />
            </div>
          </div>

          <p className="mb-4 text-sm text-on-background/50">
            {filtered.length}{" "}
            {filtered.length === 1 ? "produto encontrado" : "produtos encontrados"}
          </p>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-outline-variant/30 py-16 text-center text-on-background/50">
              Nenhum produto encontrado com esses filtros.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileFiltersOpen(false)}
            aria-hidden="true"
          />
          <div className="relative ml-auto flex h-full w-full max-w-xs flex-col overflow-y-auto bg-background p-6">
            <FilterSidebar
              brandSlug={brandSlug}
              onBrandChange={setBrandSlug}
              inStockOnly={inStockOnly}
              onInStockChange={setInStockOnly}
              minPrice={minPrice}
              maxPrice={maxPrice}
              priceBounds={range}
              onPriceChange={(min, max) => {
                setMinPrice(min);
                setMaxPrice(max);
              }}
            />
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              className="mt-6 rounded-full bg-primary-container py-3 font-semibold text-on-primary-container"
            >
              Ver {filtered.length} resultados
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
