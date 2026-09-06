"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { SearchIcon } from "@/components/icons";
import { formatBRL } from "@/lib/cart";
import type { Product } from "@/lib/types";

export default function SearchBar({
  query,
  onQueryChange,
  suggestions,
  className = "",
}: {
  query: string;
  onQueryChange: (value: string) => void;
  suggestions: Product[];
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const showDropdown = focused && query.trim().length > 0 && suggestions.length > 0;

  return (
    <div className={`relative w-full max-w-md ${className}`}>
      <div className="flex items-center gap-2 rounded-full border border-outline-variant/30 bg-surface-container px-4 py-2.5">
        <SearchIcon className="h-4 w-4 shrink-0 text-on-background/50" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Buscar produto, categoria ou marca..."
          className="w-full bg-transparent text-sm text-on-background placeholder:text-on-background/40 focus:outline-none"
        />
      </div>
      {showDropdown && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container shadow-xl">
          {suggestions.map((product) => (
            <Link
              key={product.id}
              href={`/produto/${product.slug}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-bright"
            >
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-container-lowest">
                <Image src={product.images[0]} alt={product.name} fill className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-on-background">{product.name}</p>
                <p className="text-xs text-on-background/50">{formatBRL(product.price)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
