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
import { BAIRROS_PADRAO } from "@/lib/constants";

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
  signup,
  saveContact,
}: {
  value: string | null;
  amount: number | null;
  quote: PickerQuote | null;
  // Cliente ainda sem nome ou bairro: em Venda e Orçamento aparece o lembrete
  // pra completar ali mesmo (não trava nada; "Agora não" esconde).
  signup: { name: string; bairro: string } | null;
  saveContact: (formData: FormData) => Promise<Result>;
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
  // Lembrete do cadastro já respondido nesta conversa (salvo ou "Agora não").
  const [signupDone, setSignupDone] = useState(false);
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

  function saveSignup(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveContact(formData);
      if (result.error) setError(result.error);
      else setSignupDone(true);
    });
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

      {withValue && signup && !signupDone && (
        <form action={saveSignup} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-wa-text">Complete o cadastro:</span>
          <input
            name="name"
            required
            defaultValue={signup.name}
            placeholder="Nome"
            aria-label="Nome do cliente"
            className="w-44 rounded-full border border-wa-border bg-wa-bg px-2.5 py-1 text-wa-text placeholder:text-wa-muted/60 focus:outline-none focus:ring-1 focus:ring-wa-green"
          />
          <input
            name="bairro"
            defaultValue={signup.bairro}
            list="resultado-bairros"
            placeholder="Bairro"
            aria-label="Bairro do cliente"
            className="w-36 rounded-full border border-wa-border bg-wa-bg px-2.5 py-1 text-wa-text placeholder:text-wa-muted/60 focus:outline-none focus:ring-1 focus:ring-wa-green"
          />
          <datalist id="resultado-bairros">
            {BAIRROS_PADRAO.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-wa-green px-3 py-1 font-medium text-wa-bg hover:brightness-110 disabled:opacity-60"
          >
            Salvar
          </button>
          <button type="button" onClick={() => setSignupDone(true)} className="text-wa-muted hover:text-wa-text">
            Agora não
          </button>
        </form>
      )}

      {error && <p className="text-status-critical">{error}</p>}
    </div>
  );
}
