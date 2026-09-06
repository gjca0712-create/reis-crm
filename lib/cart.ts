import type { CartLine, Product, ResolvedCartLine } from "./types";

export const CART_STORAGE_KEY = "reis:cart:v1";

function isValidCartLines(value: unknown): value is CartLine[] {
  return (
    Array.isArray(value) &&
    value.every(
      (line) =>
        typeof line === "object" &&
        line !== null &&
        typeof (line as CartLine).productId === "string" &&
        typeof (line as CartLine).quantity === "number" &&
        (line as CartLine).quantity > 0
    )
  );
}

export function loadCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return isValidCartLines(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCart(lines: CartLine[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // localStorage indisponível (modo privado, cota cheia) — falha em silêncio.
  }
}

// Só productId+quantity persistem; nome/preço são resolvidos aqui a partir do catálogo
// estático a cada leitura. Produto removido do catálogo em um deploy futuro é descartado
// em vez de renderizar dado quebrado/desatualizado.
export function resolveCartLines(lines: CartLine[], products: Product[]): ResolvedCartLine[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const resolved: ResolvedCartLine[] = [];
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) continue;
    resolved.push({ product, quantity: line.quantity, lineTotal: product.price * line.quantity });
  }
  return resolved;
}

export function cartSubtotal(resolved: ResolvedCartLine[]): number {
  return resolved.reduce((sum, line) => sum + line.lineTotal, 0);
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Não é um checkout real — a mensagem precisa deixar isso explícito ("estimado",
// "sujeito à confirmação"), já que não há cálculo de frete nem pagamento nesta fase.
export function buildOrcamentoMessage(
  resolved: ResolvedCartLine[],
  customer?: { name?: string; notes?: string }
): string {
  const itemLines = resolved.map((line, index) => {
    const { product, quantity } = line;
    return `${index + 1}. ${product.name} (${product.unit}) — Qtd: ${quantity} — ${formatBRL(product.price)}/un`;
  });

  const total = cartSubtotal(resolved);

  const parts = [
    "Olá! Gostaria de solicitar um orçamento para os itens abaixo:",
    "",
    ...itemLines,
    "",
    `Total estimado: ${formatBRL(total)} (sujeito à confirmação de disponibilidade e frete)`,
  ];

  if (customer?.name) {
    parts.push("", `Nome: ${customer.name}`);
  }
  if (customer?.notes) {
    parts.push(`Observações: ${customer.notes}`);
  }

  parts.push("", "Enviado pelo site Reis Materiais de Construção.");

  return parts.join("\n");
}
