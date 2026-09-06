"use client";

import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import CartLineItem from "@/components/cart/CartLineItem";
import CartSummary from "@/components/cart/CartSummary";
import { useCart } from "@/components/cart/CartProvider";
import { resolveCartLines, cartSubtotal } from "@/lib/cart";
import { products } from "@/data/products";
import { ArrowRightIcon, CartIcon } from "@/components/icons";

export default function CarrinhoPage() {
  const { lines, hydrated } = useCart();
  const resolved = resolveCartLines(lines, products);
  const subtotal = cartSubtotal(resolved);
  const itemCount = resolved.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <>
      <PageHeader title="Seu Carrinho">
        Revise os itens antes de solicitar o orçamento.
      </PageHeader>

      <div className="mx-auto max-w-5xl px-6 py-10">
        {!hydrated ? (
          <p className="text-on-background/50">Carregando carrinho...</p>
        ) : resolved.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-outline-variant/30 py-20 text-center">
            <CartIcon className="h-10 w-10 text-on-background/30" />
            <p className="text-on-background/60">Seu carrinho está vazio.</p>
            <Link
              href="/catalogo"
              className="inline-flex items-center gap-2 rounded-full bg-primary-container px-6 py-3 font-label-bold font-semibold text-on-primary-container"
            >
              Ver Catálogo
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            <div>
              {resolved.map((line) => (
                <CartLineItem key={line.product.id} line={line} />
              ))}
            </div>
            <div>
              <CartSummary subtotal={subtotal} itemCount={itemCount}>
                <Link
                  href="/orcamento"
                  className="mt-4 flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary-container px-6 py-3 font-label-bold font-semibold text-on-primary-container"
                >
                  Solicitar Orçamento
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
                <Link
                  href="/catalogo"
                  className="mt-3 flex min-h-[44px] items-center justify-center rounded-full border border-outline-variant/30 px-6 py-2.5 text-sm font-semibold text-on-background transition-colors hover:border-primary hover:text-primary"
                >
                  Continuar comprando
                </Link>
              </CartSummary>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
