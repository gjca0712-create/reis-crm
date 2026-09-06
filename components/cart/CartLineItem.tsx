"use client";

import Image from "next/image";
import Link from "next/link";
import { formatBRL } from "@/lib/cart";
import type { ResolvedCartLine } from "@/lib/types";
import { useCart } from "./CartProvider";
import { CloseIcon } from "@/components/icons";

export default function CartLineItem({ line }: { line: ResolvedCartLine }) {
  const { setQuantity, removeItem } = useCart();
  const { product, quantity, lineTotal } = line;

  return (
    <div className="flex gap-4 border-b border-outline-variant/20 py-4">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-container">
        <Image src={product.images[0]} alt={product.name} fill className="object-cover" />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/produto/${product.slug}`}
            className="font-display font-semibold hover:text-primary"
          >
            {product.name}
          </Link>
          <button
            type="button"
            onClick={() => removeItem(product.id)}
            aria-label={`Remover ${product.name} do carrinho`}
            className="text-on-background/50 hover:text-primary"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-on-background/60">
          {product.unit} — {formatBRL(product.price)}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuantity(product.id, quantity - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-lg hover:bg-surface-bright"
              aria-label="Diminuir quantidade"
            >
              −
            </button>
            <span className="w-8 text-center font-semibold">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity(product.id, quantity + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-lg hover:bg-surface-bright"
              aria-label="Aumentar quantidade"
            >
              +
            </button>
          </div>
          <span className="font-display font-semibold text-primary">{formatBRL(lineTotal)}</span>
        </div>
      </div>
    </div>
  );
}
