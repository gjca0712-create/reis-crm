"use client";

import { useState, type FormEvent } from "react";
import { whatsappUrl } from "@/lib/whatsapp";
import { trackWhatsAppClick } from "@/lib/analytics";
import { ArrowRightIcon } from "@/components/icons";

// O "envio" abre o WhatsApp com a mensagem pré-preenchida (mecanismo principal,
// sempre funciona) e, em paralelo, registra um Lead no CRM da Reis via
// /api/lead — se o CRM estiver fora do ar, a falha é silenciosa e não trava o
// fluxo do cliente, já que o WhatsApp continua sendo o canal de verdade.
export default function ContatoForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = [
      "Olá! Vim pelo formulário de contato do site da Reis Materiais de Construção.",
      "",
      `Nome: ${name}`,
      `Contato: ${phone}${email ? ` / ${email}` : ""}`,
      "",
      message,
    ].join("\n");
    trackWhatsAppClick("contato-form");
    window.open(whatsappUrl(text), "_blank", "noopener,noreferrer");

    fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, email: email || undefined, message }),
    }).catch(() => {
      // Falha silenciosa — o WhatsApp já abriu, é o canal que realmente importa aqui.
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <label>
        <span className="text-sm font-semibold text-on-background">Nome</span>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-outline-variant/30 bg-surface-container px-4 py-2.5 text-on-background focus:border-primary focus:outline-none"
          placeholder="Seu nome"
        />
      </label>
      <label>
        <span className="text-sm font-semibold text-on-background">Telefone / WhatsApp</span>
        <input
          type="text"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 w-full rounded-lg border border-outline-variant/30 bg-surface-container px-4 py-2.5 text-on-background focus:border-primary focus:outline-none"
          placeholder="(75) 90000-0000"
        />
      </label>
      <label>
        <span className="text-sm font-semibold text-on-background">E-mail (opcional)</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-outline-variant/30 bg-surface-container px-4 py-2.5 text-on-background focus:border-primary focus:outline-none"
          placeholder="seu@email.com"
        />
      </label>
      <label>
        <span className="text-sm font-semibold text-on-background">Mensagem</span>
        <textarea
          required
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1 w-full rounded-lg border border-outline-variant/30 bg-surface-container px-4 py-2.5 text-on-background focus:border-primary focus:outline-none"
          placeholder="Como podemos ajudar?"
        />
      </label>
      <button
        type="submit"
        className="mt-2 flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 font-label-bold font-semibold text-white transition-colors hover:bg-[#1EBE5A]"
      >
        Enviar pelo WhatsApp
        <ArrowRightIcon className="h-4 w-4" />
      </button>
    </form>
  );
}
