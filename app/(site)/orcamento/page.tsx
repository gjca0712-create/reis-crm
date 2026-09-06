"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { useCart } from "@/components/cart/CartProvider";
import { resolveCartLines, cartSubtotal, buildOrcamentoMessage, formatBRL } from "@/lib/cart";
import { whatsappUrl } from "@/lib/whatsapp";
import { trackBeginCheckout, trackWhatsAppClick } from "@/lib/analytics";
import { products } from "@/data/products";
import { ArrowRightIcon } from "@/components/icons";

export default function OrcamentoPage() {
  const { lines, hydrated } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [sent, setSent] = useState(false);

  const resolved = useMemo(() => resolveCartLines(lines, products), [lines]);
  const subtotal = useMemo(() => cartSubtotal(resolved), [resolved]);

  const message = useMemo(
    () => buildOrcamentoMessage(resolved, { name, notes }),
    [resolved, name, notes]
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    trackBeginCheckout(subtotal, resolved.length);
    trackWhatsAppClick("orcamento");
    setSent(true);
    window.open(whatsappUrl(message), "_blank", "noopener,noreferrer");

    // Registra como Lead no CRM da Reis pra equipe dar seguimento mesmo se o
    // cliente não enviar a mensagem do WhatsApp que acabou de abrir. Falha
    // silenciosa — o WhatsApp já é o canal principal e não pode ser travado por isso.
    fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, message }),
    }).catch(() => {});
  }

  if (hydrated && resolved.length === 0) {
    return (
      <>
        <PageHeader title="Solicitar Orçamento" />
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <p className="text-on-background/60">
            Seu carrinho está vazio. Adicione produtos no catálogo antes de solicitar o
            orçamento.
          </p>
          <Link
            href="/catalogo"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary-container px-6 py-3 font-label-bold font-semibold text-on-primary-container"
          >
            Ver Catálogo
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Solicitar Orçamento">
        Confirme seus dados — vamos gerar uma mensagem com todos os itens do carrinho para você
        enviar direto pelo WhatsApp.
      </PageHeader>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <form onSubmit={handleSubmit} className="grid gap-6 sm:grid-cols-2">
          <label className="sm:col-span-1">
            <span className="text-sm font-semibold text-on-background">Nome</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-outline-variant/30 bg-surface-container px-4 py-2.5 text-on-background focus:border-primary focus:outline-none"
              placeholder="Seu nome"
            />
          </label>
          <label className="sm:col-span-1">
            <span className="text-sm font-semibold text-on-background">Telefone / WhatsApp</span>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-outline-variant/30 bg-surface-container px-4 py-2.5 text-on-background focus:border-primary focus:outline-none"
              placeholder="(75) 90000-0000"
            />
          </label>
          <label className="sm:col-span-1">
            <span className="text-sm font-semibold text-on-background">Total estimado</span>
            <div className="mt-1 flex h-[46px] items-center rounded-lg bg-surface-container px-4 font-display font-semibold text-primary">
              {formatBRL(subtotal)}
            </div>
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-semibold text-on-background">
              Observações (opcional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-outline-variant/30 bg-surface-container px-4 py-2.5 text-on-background focus:border-primary focus:outline-none"
              placeholder="Prazo de entrega, endereço da obra, etc."
            />
          </label>

          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-on-background/50">
              Prévia da mensagem
            </p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-zinc-100/80">
              {message}
            </pre>
          </div>

          <button
            type="submit"
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 font-label-bold font-semibold text-white transition-colors hover:bg-[#1EBE5A] sm:col-span-2"
          >
            {sent ? "Reabrir WhatsApp" : "Enviar pelo WhatsApp"}
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>
  );
}
