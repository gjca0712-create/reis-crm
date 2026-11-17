"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { FOLLOW_UP_OPTIONS, QUOTE_LOST_REASONS, followUpLabel } from "@/lib/whatsapp/outcome";
import { closeQuote, snoozeQuote } from "@/app/admin/(app)/whatsapp/suporte/actions";
import { ContactAvatar } from "./ContactAvatar";

// Um orçamento em aberto na aba Retornos (datas em ISO: vem do servidor).
export type FollowUpItem = {
  id: string; // a conversa do orçamento
  number: number;
  customerId: string;
  customerName: string;
  value: number | null;
  quotedAt: string;
  followUpAt: string;
  calls: number;
  agentName: string | null; // na visão Equipe: de quem é
  canOpen: boolean; // dá pra abrir a conversa (em aberto, ou CEO/Gerente)
};

const quotedDay = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit" });

// Aba "Retornos" do Suporte: os orçamentos em aberto cujo retorno chegou (os
// próximos ficam embaixo, recolhidos). "Chamar" abre a Nova conversa com o
// cliente e a mensagem de retorno prontas; "Vendeu", "Não fechou" e "Adiar"
// resolvem ali mesmo.
export function QuoteFollowUps({
  due,
  upcoming,
  activeId,
}: {
  due: FollowUpItem[];
  upcoming: FollowUpItem[];
  activeId: string | undefined;
}) {
  return (
    <div className="overflow-y-auto flex-1 min-h-0 rounded-b-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-wa-border bg-wa-panel px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-wa-green">
        <span>Retornar hoje</span>
        <span className="min-w-[20px] text-center leading-[18px] text-wa-muted">{due.length}</span>
      </div>
      {due.length > 0 ? (
        due.map((q) => <FollowUpRow key={q.id} item={q} active={q.id === activeId} />)
      ) : (
        <p className="px-4 py-4 text-xs text-wa-muted">
          Nenhum retorno pra hoje. Quando uma conversa é marcada como Orçamento, o cliente aparece aqui no dia de
          chamar de novo.
        </p>
      )}
      {upcoming.length > 0 && (
        <details className="group">
          <summary className="sticky top-0 z-10 flex cursor-pointer list-none items-center justify-between gap-2 border-y border-wa-border bg-wa-panel px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-wa-muted hover:text-wa-text">
            <span>Próximos retornos</span>
            <span className="min-w-[20px] text-center leading-[18px]">{upcoming.length}</span>
          </summary>
          {upcoming.map((q) => (
            <FollowUpRow key={q.id} item={q} active={q.id === activeId} />
          ))}
        </details>
      )}
    </div>
  );
}

function FollowUpRow({ item, active }: { item: FollowUpItem; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const when = followUpLabel(new Date(item.followUpAt));

  function run(task: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (result.error) setError(result.error);
    });
  }

  const name = (
    <span className="text-[15px] text-wa-text truncate">
      {item.customerName} <span className="text-[13px] font-semibold">#{item.number}</span>
    </span>
  );
  const select =
    "rounded-full border border-wa-border bg-wa-panel px-2 py-1 text-xs text-wa-muted hover:text-wa-text disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-wa-green";

  return (
    <div
      className={`relative flex gap-3 px-3 py-3 border-b border-wa-border ${active ? "bg-wa-active" : ""} ${
        pending ? "opacity-60" : ""
      }`}
    >
      {when.late && (
        <span className="absolute left-0 top-0 bottom-0 w-1 bg-[rgb(244,63,94)]" title="Retorno atrasado" />
      )}
      <ContactAvatar customerId={item.customerId} name={item.customerName} className="w-10 h-10 text-sm shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          {item.canOpen ? (
            <Link href={`/admin/whatsapp/suporte?c=${item.id}`} className="min-w-0 truncate hover:underline">
              {name}
            </Link>
          ) : (
            name
          )}
          <span className="shrink-0 text-[13px] font-semibold text-wa-text tabular-nums">
            {item.value !== null ? formatCurrency(item.value) : <span className="font-normal text-wa-muted">sem valor</span>}
          </span>
        </div>
        <p className="text-[12px] text-wa-muted truncate">
          Orçamento de {quotedDay.format(new Date(item.quotedAt))}
          {item.calls > 0 ? ` · já chamado ${item.calls}×` : ""}
          {item.agentName ? ` · ${item.agentName}` : ""}
        </p>
        <p className={`text-[12px] ${when.late ? "text-[rgb(244,63,94)]" : "text-wa-muted"}`}>
          Retorno: <span className={when.late ? "" : "text-wa-text"}>{when.text}</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Link
            href={`/admin/whatsapp/suporte?novo=${item.customerId}&retorno=${item.id}`}
            className="inline-flex items-center gap-1 rounded-full bg-wa-green px-2.5 py-1 text-xs font-medium text-wa-bg hover:brightness-110"
          >
            <MessageCircle className="w-3.5 h-3.5" /> Chamar
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => closeQuote(item.id, "VENDIDO"))}
            className="rounded-full border border-wa-border px-2.5 py-1 text-xs font-medium text-wa-text hover:bg-wa-active disabled:opacity-50"
            title="O cliente comprou (pelo WhatsApp, na loja ou por telefone)"
          >
            Vendeu
          </button>
          <select
            className={select}
            value=""
            disabled={pending}
            onChange={(e) => run(() => closeQuote(item.id, "PERDIDO", e.target.value))}
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
          <select
            className={select}
            value=""
            disabled={pending}
            onChange={(e) => run(() => snoozeQuote(item.id, Number(e.target.value)))}
            aria-label="Adiar o retorno"
          >
            <option value="" disabled>
              Adiar…
            </option>
            {FOLLOW_UP_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-xs text-status-critical">{error}</p>}
      </div>
    </div>
  );
}
