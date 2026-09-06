"use client";

import { brands } from "@/data/brands";
import { formatBRL } from "@/lib/cart";

export default function FilterSidebar({
  className = "",
  brandSlug,
  onBrandChange,
  inStockOnly,
  onInStockChange,
  minPrice,
  maxPrice,
  priceBounds,
  onPriceChange,
}: {
  className?: string;
  brandSlug?: string;
  onBrandChange: (slug: string | undefined) => void;
  inStockOnly: boolean;
  onInStockChange: (value: boolean) => void;
  minPrice?: number;
  maxPrice?: number;
  priceBounds: { min: number; max: number };
  onPriceChange: (min: number | undefined, max: number | undefined) => void;
}) {
  return (
    <aside className={`w-full space-y-8 lg:w-64 lg:shrink-0 ${className}`}>
      <div>
        <h3 className="font-label-bold text-sm font-semibold text-on-background">Marca</h3>
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-on-background/70">
            <input
              type="radio"
              name="marca"
              checked={!brandSlug}
              onChange={() => onBrandChange(undefined)}
              className="accent-[#F2CA50]"
            />
            Todas as marcas
          </label>
          {brands.map((brand) => (
            <label
              key={brand.slug}
              className="flex items-center gap-2 text-sm text-on-background/70"
            >
              <input
                type="radio"
                name="marca"
                checked={brandSlug === brand.slug}
                onChange={() => onBrandChange(brand.slug)}
                className="accent-[#F2CA50]"
              />
              {brand.name}
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-label-bold text-sm font-semibold text-on-background">Preço</h3>
        <div className="mt-3 flex items-center gap-2 text-sm text-on-background/70">
          <input
            type="number"
            min={0}
            placeholder={String(priceBounds.min)}
            value={minPrice ?? ""}
            onChange={(e) =>
              onPriceChange(e.target.value ? Number(e.target.value) : undefined, maxPrice)
            }
            className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2 text-on-background"
            aria-label="Preço mínimo"
          />
          <span>até</span>
          <input
            type="number"
            min={0}
            placeholder={String(priceBounds.max)}
            value={maxPrice ?? ""}
            onChange={(e) =>
              onPriceChange(minPrice, e.target.value ? Number(e.target.value) : undefined)
            }
            className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2 text-on-background"
            aria-label="Preço máximo"
          />
        </div>
        <p className="mt-1 text-xs text-on-background/40">
          Faixa disponível: {formatBRL(priceBounds.min)} — {formatBRL(priceBounds.max)}
        </p>
      </div>

      <div>
        <h3 className="font-label-bold text-sm font-semibold text-on-background">
          Disponibilidade
        </h3>
        <label className="mt-3 flex items-center gap-2 text-sm text-on-background/70">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => onInStockChange(e.target.checked)}
            className="accent-[#F2CA50]"
          />
          Somente em estoque
        </label>
      </div>
    </aside>
  );
}
