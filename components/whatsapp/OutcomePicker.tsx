"use client";

import { useOptimistic, useState, useTransition } from "react";
import { CONVERSATION_OUTCOMES, type ConversationOutcome } from "@/lib/whatsapp/outcome";

// Resultado do atendimento, embaixo do cabeçalho da conversa: o atendente
// marca Venda, Orçamento ou Informação (clicar de novo desmarca). Muda na hora
// na tela (useOptimistic) e a action grava — sem recarregar nem tirar o foco
// da caixa de resposta.
export function OutcomePicker({
  value,
  action,
  open,
}: {
  value: string | null;
  action: (outcome: ConversationOutcome | null) => Promise<{ error?: string }>;
  // Conversa em aberto: mostra o lembrete de marcar antes de finalizar.
  open: boolean;
}) {
  const [current, setCurrent] = useOptimistic(value);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(id: ConversationOutcome) {
    const next = current === id ? null : id;
    setError(null);
    startTransition(async () => {
      setCurrent(next);
      const result = await action(next);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2 bg-wa-panel border-t border-wa-border text-xs">
      <span className="text-wa-muted mr-0.5">Resultado:</span>
      {CONVERSATION_OUTCOMES.map((o) => {
        const selected = current === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => pick(o.id)}
            aria-pressed={selected}
            title={selected ? `${o.hint} — clique de novo pra desmarcar` : o.hint}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition-colors ${
              selected ? "text-wa-text" : "border-wa-border text-wa-muted hover:text-wa-text hover:bg-wa-active"
            }`}
            style={selected ? { borderColor: o.color, backgroundColor: `${o.color}2e` } : undefined}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: o.color }} aria-hidden />
            {o.label}
          </button>
        );
      })}
      {error ? (
        <span className="text-status-critical">{error}</span>
      ) : (
        open && !current && <span className="hidden xl:inline text-wa-muted">· marque antes de finalizar</span>
      )}
    </div>
  );
}
