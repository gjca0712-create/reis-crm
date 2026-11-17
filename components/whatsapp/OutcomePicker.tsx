"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import {
  CONVERSATION_OUTCOMES,
  FOLLOW_UP_OPTIONS,
  QUOTE_LOST_REASONS,
  followUpLabel,
  moneyInput,
  quoteLostReasonLabel,
  type ConversationOutcome,
} from "@/lib/whatsapp/outcome";

type Result = { error?: string };

// O orçamento da conversa (quando ela foi marcada Orçamento alguma vez).
export type PickerQuote = {
  status: string; // ABERTO | VENDIDO | PERDIDO
  followUpAt: string | null; // ISO
  lostReason: string | null;
};

// Resultado do atendimento, embaixo do cabeçalho da conversa: o atendente
// marca Venda, Orçamento ou Informação (clicar de novo desmarca). Muda na hora
// na tela (useOptimistic) e a action grava — sem recarregar nem tirar o foco
// da caixa de resposta. Venda e Orçamento abrem uma segunda linha: o valor em
// R$ e, no orçamento, quando retornar pro cliente (aba Retornos) ou que não
// fechou.
export function OutcomePicker({
  value,
  amount,
  quote,
  open,
  action,
  setValue,
  snooze,
  close,
  reopen,
}: {
  value: string | null;
  amount: number | null;
  quote: PickerQuote | null;
  // Conversa em aberto: mostra o lembrete de marcar antes de finalizar.
  open: boolean;
  action: (outcome: ConversationOutcome | null) => Promise<Result>;
  setValue: (raw: string) => Promise<Result>;
  snooze: (days: number) => Promise<Result>;
  close: (result: "VENDIDO" | "PERDIDO", reason?: string) => Promise<Result>;
  reopen: () => Promise<Result>;
}) {
  const [current, setCurrent] = useOptimistic(value);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [money, setMoney] = useState(moneyInput(amount));
  // Valor novo vindo do servidor (outro atendente, ou o próprio depois de salvar).
  useEffect(() => setMoney(moneyInput(amount)), [amount]);

  function run(task: () => Promise<Result>, optimistic?: () => void) {
    setError(null);
    startTransition(async () => {
      optimistic?.();
      const result = await task();
      if (result.error) setError(result.error);
    });
  }

  function pick(id: ConversationOutcome) {
    const next = current === id ? null : id;
    run(() => action(next), () => setCurrent(next));
  }

  function saveMoney() {
    if (money.trim() === moneyInput(amount)) return;
    run(() => setValue(money));
  }

  const withValue = current === "VENDA" || current === "ORCAMENTO";
  // Logo depois de marcar Orçamento o servidor ainda não respondeu: o retorno
  // padrão é amanhã.
  const quoteNow = current === "ORCAMENTO" ? (quote ?? { status: "ABERTO", followUpAt: null, lostReason: null }) : null;
  const followUp = quoteNow?.followUpAt ? followUpLabel(new Date(quoteNow.followUpAt)) : null;
  const select =
    "rounded-full border border-wa-border bg-wa-panel px-2 py-1 text-xs text-wa-muted hover:text-wa-text focus:outline-none focus:ring-1 focus:ring-wa-green";

  return (
    <div className="px-4 py-2 bg-wa-panel border-t border-wa-border text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
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
        {!withValue && open && !current && !error && (
          <span className="hidden xl:inline text-wa-muted">· marque antes de finalizar</span>
        )}
      </div>

      {withValue && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label className="inline-flex items-center gap-1.5 text-wa-muted">
            Valor
            <span className="inline-flex items-center rounded-full border border-wa-border bg-wa-bg pl-2.5 focus-within:ring-1 focus-within:ring-wa-green">
              <span className="text-wa-muted">R$</span>
              <input
                inputMode="decimal"
                value={money}
                onChange={(e) => setMoney(e.target.value)}
                onBlur={saveMoney}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                placeholder="0,00"
                aria-label={current === "VENDA" ? "Valor da venda" : "Valor do orçamento"}
                className="w-24 bg-transparent px-1.5 py-1 text-wa-text tabular-nums placeholder:text-wa-muted/60 focus:outline-none"
              />
            </span>
          </label>

          {quoteNow?.status === "ABERTO" && (
            <>
              <span className={followUp?.late ? "text-[rgb(244,63,94)]" : "text-wa-muted"}>
                Retorno: <span className="text-wa-text">{followUp?.text ?? "amanhã"}</span>
              </span>
              <select
                className={select}
                value=""
                disabled={pending}
                onChange={(e) => run(() => snooze(Number(e.target.value)))}
                aria-label="Mudar o dia do retorno"
              >
                <option value="" disabled>
                  Mudar retorno…
                </option>
                {FOLLOW_UP_OPTIONS.map((o) => (
                  <option key={o.days} value={o.days}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                className={select}
                value=""
                disabled={pending}
                onChange={(e) => run(() => close("PERDIDO", e.target.value))}
                aria-label="Marcar que o orçamento não fechou"
              >
                <option value="" disabled>
                  Não fechou…
                </option>
                {QUOTE_LOST_REASONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </>
          )}
          {quoteNow?.status === "PERDIDO" && (
            <span className="text-wa-muted">
              Não fechou · {quoteLostReasonLabel(quoteNow.lostReason) ?? "sem motivo"} ·{" "}
              <button type="button" onClick={() => run(reopen)} className="text-wa-green hover:brightness-110">
                Reabrir
              </button>
            </span>
          )}
          {current === "VENDA" && quote?.status === "VENDIDO" && (
            <span className="text-wa-muted">Veio de um orçamento ✓</span>
          )}
        </div>
      )}

      {error && <p className="text-status-critical">{error}</p>}
    </div>
  );
}
