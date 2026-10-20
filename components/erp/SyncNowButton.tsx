"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { requestErpSyncAction, erpSyncRequestStatusAction } from "@/app/admin/(app)/financeiro/actions";

// "Atualizar agora": anota o pedido no CRM e espera o programa da loja (que
// confere a cada minuto) terminar a rodada — aí recarrega a tela com os números
// novos. Ver lib/erp/sync-request.ts.
const POLL_MS = 3000;
// O programa pega o pedido em até 1 min; a conferência completa do dia pode
// levar alguns minutos a mais.
const GIVE_UP_MS = 4 * 60_000;

type State = "idle" | "waiting" | "noAnswer";

export function SyncNowButton({ initialPending }: { initialPending: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>(initialPending ? "waiting" : "idle");
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (state !== "waiting") return;
    let stopped = false;
    let busy = false;
    const id = window.setInterval(async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        const { pending } = await erpSyncRequestStatusAction();
        if (stopped) return;
        if (!pending) {
          setState("idle");
          router.refresh();
        } else if (Date.now() - startedAt.current > GIVE_UP_MS) {
          setState("noAnswer");
        }
      } catch {
        // sem internet por um instante: pergunta de novo no próximo
      } finally {
        busy = false;
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [state, router]);

  async function onClick() {
    startedAt.current = Date.now();
    setState("waiting");
    const { ok } = await requestErpSyncAction().catch(() => ({ ok: false }));
    if (!ok) setState("idle");
  }

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={onClick}
        disabled={state === "waiting"}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink-secondary hover:text-ink-primary hover:border-gold-400/50 transition-colors disabled:opacity-70 disabled:cursor-wait"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${state === "waiting" ? "animate-spin" : ""}`} />
        {state === "waiting" ? "Atualizando…" : "Atualizar agora"}
      </button>
      {state === "waiting" && <span className="text-xs text-ink-muted">leva até 1 minuto</span>}
      {state === "noAnswer" && (
        <span className="text-xs text-status-warning">
          O computador da loja não respondeu — pode estar desligado. Atualiza sozinho quando ele ligar.
        </span>
      )}
    </span>
  );
}
