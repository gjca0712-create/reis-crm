"use client";

import Link from "next/link";
import { CartIcon as CartGlyph } from "@/components/icons";
import { useCart } from "./CartProvider";

export default function CartIcon() {
  const { count } = useCart();
  return (
    <Link
      href="/carrinho"
      aria-label="Ver carrinho"
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-on-background transition-colors hover:text-primary"
    >
      <CartGlyph className="h-6 w-6" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-on-primary-container">
          {count}
        </span>
      )}
    </Link>
  );
}
