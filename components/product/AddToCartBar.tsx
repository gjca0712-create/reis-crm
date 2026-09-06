"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart/CartProvider";
import { trackAddToCart } from "@/lib/analytics";
import type { Product } from "@/lib/types";
import { CartIcon } from "@/components/icons";

export default function AddToCartBar({ product }: { product: Product }) {
  const { addItem } = useCart();
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const disabled = product.stock === "indisponivel";

  function handleAdd() {
    addItem(product.id, quantity);
    trackAddToCart(product.slug, product.name, product.price, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  function handleQuoteNow() {
    if (!disabled) {
      addItem(product.id, quantity);
      trackAddToCart(product.slug, product.name, product.price, quantity);
    }
    router.push("/orcamento");
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2 self-start rounded-full border border-outline-variant/30 px-2 py-1">
        <button
          type="button"
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg hover:bg-surface-container"
          aria-label="Diminuir quantidade"
        >
          −
        </button>
        <span className="w-8 text-center font-semibold">{quantity}</span>
        <button
          type="button"
          onClick={() => setQuantity((q) => q + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg hover:bg-surface-container"
          aria-label="Aumentar quantidade"
        >
          +
        </button>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={handleAdd}
        className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full bg-primary-container px-6 py-3 font-label-bold font-semibold text-on-primary-container transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        <CartIcon className="h-5 w-5" />
        {added ? "Adicionado!" : disabled ? "Indisponível" : "Adicionar ao Carrinho"}
      </button>
      <button
        type="button"
        onClick={handleQuoteNow}
        disabled={disabled}
        className="min-h-[48px] flex-1 rounded-full border-2 border-on-background/20 px-6 py-3 font-label-bold font-semibold text-on-background transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        Pedir Orçamento
      </button>
    </div>
  );
}
