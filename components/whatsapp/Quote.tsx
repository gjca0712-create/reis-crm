"use client";

import { useState } from "react";
import { Reply } from "lucide-react";

// "Responder" uma mensagem específica, igual ao WhatsApp. O botão fica no
// balão (ChatTimeline, renderizado no servidor) e a caixa de texto é outro
// componente (ReplyForm): o aviso vai por um evento da janela.
export const QUOTE_EVENT = "wa-quote";
// id: o id da mensagem no CRM (o servidor confere e acha o resto).
export type QuoteDraft = { id: string; author: string; text: string };

export function ReplyToButton({ quote, className = "" }: { quote: QuoteDraft; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent<QuoteDraft>(QUOTE_EVENT, { detail: quote }))}
      className={`p-1.5 rounded-full text-wa-muted hover:text-wa-text hover:bg-wa-active transition ${className}`}
      aria-label="Responder esta mensagem"
      title="Responder"
    >
      <Reply className="w-4 h-4" />
    </button>
  );
}

// A mensagem respondida, em cima do texto do balão. Clicar leva até ela na
// conversa e pisca o balão — se ela estiver na tela (pode ser mais antiga que
// o que está carregado, ou de antes do CRM).
export function QuotedBlock({ waMessageId, author, text }: { waMessageId: string; author: string; text: string }) {
  const [missing, setMissing] = useState(false);

  function jump() {
    const el = document.querySelector<HTMLElement>(`[data-wa-ids~="${CSS.escape(waMessageId)}"]`);
    if (!el) {
      setMissing(true);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.animate(
      [{ boxShadow: "0 0 0 3px rgba(0, 168, 132, 0.9)" }, { boxShadow: "0 0 0 3px rgba(0, 168, 132, 0)" }],
      { duration: 1800, easing: "ease-out" }
    );
  }

  return (
    <button
      type="button"
      onClick={jump}
      className="mb-1 block w-full min-w-40 text-left rounded-md border-l-4 border-wa-green bg-black/20 px-2 py-1 hover:bg-black/30 transition-colors"
      title="Ver a mensagem respondida"
    >
      <span className="block text-[12.5px] font-medium text-wa-green">{author}</span>
      <span className="block text-[13px] leading-[17px] text-wa-muted line-clamp-3 whitespace-pre-wrap break-words">
        {text}
      </span>
      {missing && (
        <span className="block mt-0.5 text-[11px] italic text-wa-muted">
          Essa mensagem não está carregada nesta tela (é mais antiga).
        </span>
      )}
    </button>
  );
}
