"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { CartLine } from "@/lib/types";
import { loadCart, saveCart } from "@/lib/cart";

type CartContextValue = {
  lines: CartLine[];
  addItem: (productId: string, quantity?: number) => void;
  removeItem: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  count: number;
  /** false até o localStorage ser lido no client — UI de contagem deve tratar isso como "0". */
  hydrated: boolean;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Estado começa vazio tanto no servidor quanto no client (evita hydration mismatch);
  // só lê o carrinho real do localStorage depois de montar. Isso é sincronização com um
  // sistema externo (localStorage, indisponível no servidor) — o caso de uso que o próprio
  // React docs usa para justificar setState num efeito de mount; testei a alternativa
  // "correta" (useSyncExternalStore) e ela disparou um warning de infinite-loop no React 19
  // + Next 16 que não reproduzi de forma determinística — o padrão abaixo é o mesmo usado
  // em todos os outros sites deste workspace (ex. pousada-manha-dourada) e comprovadamente
  // estável.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(loadCart());
    setHydrated(true);
  }, []);

  // Só persiste depois de hidratar — do contrário, este efeito rodaria com lines=[] antes
  // do load acima e sobrescreveria o carrinho salvo.
  useEffect(() => {
    if (!hydrated) return;
    saveCart(lines);
  }, [lines, hydrated]);

  function addItem(productId: string, quantity = 1) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        return prev.map((l) =>
          l.productId === productId ? { ...l, quantity: l.quantity + quantity } : l
        );
      }
      return [...prev, { productId, quantity }];
    });
  }

  function removeItem(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  function setQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity } : l)));
  }

  function clear() {
    setLines([]);
  }

  const count = hydrated ? lines.reduce((sum, l) => sum + l.quantity, 0) : 0;

  return (
    <CartContext.Provider
      value={{ lines, addItem, removeItem, setQuantity, clear, count, hydrated }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart deve ser usado dentro de <CartProvider>");
  return ctx;
}
