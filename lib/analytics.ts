// Eventos de conversão. Funciona com Google Analytics 4 (gtag) — se o GA não estiver
// carregado, toda função aqui falha em silêncio (ver bloco comentado em app/layout.tsx).
type Gtag = (...args: unknown[]) => void;

function gtag(): Gtag | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { gtag?: Gtag }).gtag;
}

export function trackWhatsAppClick(label: string) {
  gtag()?.("event", "whatsapp_click", {
    event_category: "conversion",
    event_label: label,
  });
}

export function trackViewItem(productSlug: string, productName: string, price: number) {
  gtag()?.("event", "view_item", {
    currency: "BRL",
    value: price,
    items: [{ item_id: productSlug, item_name: productName, price }],
  });
}

export function trackAddToCart(productSlug: string, productName: string, price: number, quantity: number) {
  gtag()?.("event", "add_to_cart", {
    currency: "BRL",
    value: price * quantity,
    items: [{ item_id: productSlug, item_name: productName, price, quantity }],
  });
}

export function trackBeginCheckout(value: number, itemCount: number) {
  gtag()?.("event", "begin_checkout", {
    currency: "BRL",
    value,
    items_count: itemCount,
  });
}
