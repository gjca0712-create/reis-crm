"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, X } from "lucide-react";
import { SECTORS, TRANSFER_REASON_MIN, sectorLabel } from "@/lib/whatsapp/sectors";
import type { TransferResult } from "@/app/admin/(app)/whatsapp/suporte/actions";

type TransferAction = (prev: TransferResult, formData: FormData) => Promise<TransferResult>;

// "Transferir" no topo da conversa: escolhe o setor e escreve o motivo
// (obrigatório). Mesmo esquema da Nova conversa: <dialog> nativo, campos
// controlados (dando erro, o texto continua lá) e, dando certo, fecha e abre a
// próxima conversa da fila — essa saiu da tela de quem transferiu.
export function TransferDialog({ action, currentSector }: { action: TransferAction; currentSector: string | null }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const options = SECTORS.filter((s) => s.id !== currentSector);
  const [sector, setSector] = useState<string>(options[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(action, undefined);
  const reasonOk = reason.trim().length >= TRANSFER_REASON_MIN;

  useEffect(() => {
    if (!state || !("next" in state)) return;
    dialog.current?.close();
    setReason("");
    router.push(state.next ? `/admin/whatsapp/suporte?c=${state.next}` : "/admin/whatsapp/suporte");
  }, [state, router]);

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
          <p className="-mt-2 text-xs text-wa-muted">
            Hoje com: <span className="text-wa-text">{sectorLabel(currentSector)}</span>. A conversa sai de você e vai
            pra fila de espera do setor escolhido.
          </p>

          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-wa-muted">Para o setor</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {options.map((s) => (
                <label
                  key={s.id}
                  className={`cursor-pointer rounded-lg px-3 py-2 text-center text-sm transition-colors ${
                    sector === s.id ? "bg-wa-green text-wa-bg font-semibold" : "bg-wa-active text-wa-text hover:bg-wa-active/70"
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

          <label className="block">
            <span className="mb-1.5 flex items-baseline justify-between text-xs font-medium text-wa-muted">
              Motivo (obrigatório)
              <span className={reasonOk ? "text-wa-green" : ""}>
                {reasonOk ? "ok" : `${reason.trim().length}/${TRANSFER_REASON_MIN}`}
              </span>
            </span>
            <textarea
              name="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: cliente quer a 2ª via do boleto da compra de 28/09"
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
              disabled={pending || !reasonOk || !sector}
              className="rounded-lg bg-wa-green text-wa-bg font-semibold px-4 py-2 text-sm hover:brightness-110 transition disabled:opacity-50 disabled:pointer-events-none"
            >
              {pending ? "Transferindo..." : "Transferir"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
