"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, X } from "lucide-react";
import { SECTORS, TRANSFER_REASON_MAX, sectorLabel } from "@/lib/whatsapp/sectors";
import type { TransferAgent } from "@/lib/whatsapp/transfer";
import type { TransferResult } from "@/app/admin/(app)/whatsapp/suporte/actions";

type TransferAction = (prev: TransferResult, formData: FormData) => Promise<TransferResult>;
type Mode = "agent" | "sector";

function workload(n: number): string {
  if (n === 0) return "nenhuma conversa agora";
  return n === 1 ? "1 conversa em atendimento" : `${n} conversas em atendimento`;
}

// "Transferir" no topo da conversa: pra um atendente (já chega assumida por
// ele) ou pra fila de um setor, com um motivo opcional. Mesmo esquema
// da Nova conversa: <dialog> nativo, campos controlados (dando erro, o texto
// continua lá) e, dando certo, fecha e abre a próxima conversa da fila — essa
// saiu da tela de quem transferiu.
// agents: quem pode receber, sem a própria pessoa e sem quem já está com a conversa.
export function TransferDialog({
  action,
  currentSector,
  currentAgent,
  agents,
}: {
  action: TransferAction;
  currentSector: string | null;
  currentAgent: string | null;
  agents: TransferAgent[];
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const sectors = SECTORS.filter((s) => s.id !== currentSector);
  const [mode, setMode] = useState<Mode>(agents.length ? "agent" : "sector");
  const [sector, setSector] = useState<string>(sectors[0]?.id ?? "");
  const [agentId, setAgentId] = useState("");
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(action, undefined);
  const agent = agents.find((a) => a.id === agentId);
  const ready = mode === "agent" ? !!agent : !!sector;

  useEffect(() => {
    if (!state || !("next" in state)) return;
    dialog.current?.close();
    setReason("");
    setAgentId("");
    router.push(state.next ? `/admin/whatsapp/suporte?c=${state.next}` : "/admin/whatsapp/suporte");
  }, [state, router]);

  const optionClass = (selected: boolean) =>
    `cursor-pointer rounded-lg transition-colors ${
      selected ? "bg-wa-green text-wa-bg" : "bg-wa-active text-wa-text hover:bg-wa-active/70"
    }`;

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex items-center gap-1.5 text-xs text-wa-muted hover:text-wa-text"
      >
        <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="transferir-titulo"
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-wa-border bg-wa-panel p-0 text-wa-text backdrop:bg-black/70"
      >
        <form action={formAction} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="to" value={mode} />
          <div className="flex items-center justify-between gap-3">
            <h2 id="transferir-titulo" className="text-base font-semibold">
              Transferir atendimento
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="text-wa-muted hover:text-wa-text"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="-mt-1 grid grid-cols-2 rounded-full bg-wa-active p-0.5" role="group" aria-label="Transferir para">
            {(
              [
                ["agent", "Para um atendente"],
                ["sector", "Para um setor"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === m ? "bg-wa-bg text-wa-text shadow-sm" : "text-wa-muted hover:text-wa-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="-mt-1 text-xs text-wa-muted">
            Hoje com:{" "}
            <span className="text-wa-text">
              {currentAgent ? `${currentAgent} · ` : ""}
              {sectorLabel(currentSector)}
            </span>
            .{" "}
            {mode === "agent"
              ? "A conversa já chega assumida por quem você escolher."
              : "A conversa vai pra fila de espera do setor escolhido."}
          </p>

          {mode === "agent" ? (
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-wa-muted">Para quem</legend>
              {agents.length === 0 ? (
                <p className="rounded-lg bg-wa-active px-3 py-2.5 text-sm text-wa-muted">
                  Nenhum outro atendente tem acesso ao Suporte.
                </p>
              ) : (
                <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
                  {agents.map((a) => (
                    <label key={a.id} className={`${optionClass(agentId === a.id)} flex items-center gap-3 px-3 py-2`}>
                      <input
                        type="radio"
                        name="agent"
                        value={a.id}
                        checked={agentId === a.id}
                        onChange={() => setAgentId(a.id)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                          agentId === a.id ? "bg-wa-bg/20" : "bg-wa-panel text-wa-green"
                        }`}
                      >
                        {a.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{a.name}</span>
                        <span className={`block text-xs ${agentId === a.id ? "text-wa-bg/80" : "text-wa-muted"}`}>
                          {sectorLabel(a.sector)} · {workload(a.openCount)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {agent?.sector && agent.sector !== currentSector && (
                <p className="mt-1.5 text-xs text-wa-muted">
                  A conversa passa pro setor {sectorLabel(agent.sector)}, que é o de {agent.name}.
                </p>
              )}
            </fieldset>
          ) : (
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-wa-muted">Para o setor</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {sectors.map((s) => (
                  <label
                    key={s.id}
                    className={`${optionClass(sector === s.id)} px-3 py-2 text-center text-sm ${
                      sector === s.id ? "font-semibold" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="sector"
                      value={s.id}
                      checked={sector === s.id}
                      onChange={() => setSector(s.id)}
                      className="sr-only"
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <label className="block">
            <span className="mb-1.5 flex items-baseline justify-between text-xs font-medium text-wa-muted">
              Motivo (opcional)
            </span>
            <textarea
              name="reason"
              rows={2}
              maxLength={TRANSFER_REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                mode === "agent"
                  ? "Ex.: cliente quer falar do pedido que você separou ontem"
                  : "Ex.: cliente quer a 2ª via do boleto da compra de 28/09"
              }
              className="w-full resize-y rounded-lg border-0 bg-wa-active px-3 py-2.5 text-sm text-wa-text placeholder:text-wa-muted focus:outline-none focus:ring-2 focus:ring-wa-green/60"
            />
          </label>

          {state && "error" in state && (
            <p className="rounded-lg border border-status-critical/30 bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-lg px-4 py-2 text-sm text-wa-muted hover:text-wa-text hover:bg-wa-active"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || !ready}
              className="rounded-lg bg-wa-green text-wa-bg font-semibold px-4 py-2 text-sm hover:brightness-110 transition disabled:opacity-50 disabled:pointer-events-none"
            >
              {pending ? "Transferindo..." : mode === "agent" && agent ? `Transferir pra ${agent.name.split(" ")[0]}` : "Transferir"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
