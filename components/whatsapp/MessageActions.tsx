"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { MessageActionResult } from "@/lib/whatsapp/message-permissions";

type MessageAction = (prev: MessageActionResult, formData: FormData) => Promise<MessageActionResult>;

const AVISOS: Record<string, string> = {
  "edicao-fora-do-prazo": "Não deu: o WhatsApp só deixa editar até 15 minutos depois do envio.",
  "edicao-nao-enviada": "Não foi editada — essa linha do WhatsApp está desconectada. Reconecte e tente de novo.",
  "apagar-fora-do-prazo": "Não deu: o WhatsApp só deixa apagar para todos até cerca de 2 dias depois do envio.",
  "apagar-nao-enviado": "Não foi apagada — essa linha do WhatsApp está desconectada. Reconecte e tente de novo.",
  indisponivel: "Essa mensagem não pode mais ser alterada.",
};

function Aviso({ result }: { result: MessageActionResult }) {
  if (!result) return null;
  return (
    <p className="mt-1 max-w-[75%] text-right text-[11px] text-status-critical">
      {AVISOS[result.aviso] ?? "Não foi possível concluir."}
    </p>
  );
}

// Caixa de edição. O envio sai pelo onSubmit (e não por <form action>) de
// propósito: com action, o React limpa o formulário depois de toda tentativa —
// uma edição que falhasse (linha caída) apagaria o texto novo digitado.
function EditBox({ text, action, onClose }: { text: string; action: MessageAction; onClose: () => void }) {
  const [result, submit, saving] = useActionState(action, undefined);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    // Salvar sem mudar nada só fecha a caixa (não manda edição vazia pro cliente).
    if (String(formData.get("body") ?? "").trim() === text.trim()) {
      onClose();
      return;
    }
    startTransition(() => submit(formData));
  }

  return (
    <>
      <form onSubmit={onSubmit} className="mt-1.5 w-full max-w-[75%] flex flex-col gap-1.5">
        <textarea
          name="body"
          defaultValue={text}
          rows={3}
          autoFocus
          required
          className="w-full resize-y rounded-lg bg-wa-active border-0 px-3 py-2 text-sm text-wa-text focus:outline-none focus:ring-2 focus:ring-wa-green/50"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-wa-muted">O cliente vê a mensagem com a marca “Editada”.</span>
          <div className="flex items-center gap-3 shrink-0">
            <button type="button" onClick={onClose} className="text-xs text-wa-muted hover:text-wa-text">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-wa-green text-wa-bg font-semibold px-3 py-1.5 text-xs hover:brightness-110 transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {saving ? "Salvando…" : "Salvar edição"}
            </button>
          </div>
        </div>
      </form>
      <Aviso result={result} />
    </>
  );
}

// Confirmação na própria linha: apagar não tem volta, o cliente também deixa de ver.
function ConfirmDelete({ action, onClose }: { action: MessageAction; onClose: () => void }) {
  const [result, submit, deleting] = useActionState(action, undefined);
  return (
    <>
      <form action={submit} className="mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
        <span className="text-wa-text">Apagar para todos? O cliente também deixa de ver.</span>
        <button type="button" onClick={onClose} className="text-wa-muted hover:text-wa-text">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={deleting}
          className="font-semibold text-status-critical hover:underline disabled:opacity-60 disabled:cursor-wait"
        >
          {deleting ? "Apagando…" : "Apagar"}
        </button>
      </form>
      <Aviso result={result} />
    </>
  );
}

// "Editar" e "Apagar para todos" embaixo de uma mensagem enviada, igual o
// menu da mensagem no WhatsApp. Quem decide se pode é o servidor
// (lib/whatsapp/message-permissions.ts), que só passa a action quando dá.
// Caixa de edição e confirmação só existem enquanto abertas: fechar e abrir de
// novo começa limpo, sem o aviso de uma tentativa anterior.
export function MessageActions({
  senderLabel,
  text,
  editAction,
  deleteAction,
}: {
  senderLabel: string;
  text: string;
  editAction?: MessageAction;
  deleteAction?: MessageAction;
}) {
  const [mode, setMode] = useState<"idle" | "editing" | "confirmDelete">("idle");
  const close = () => setMode("idle");

  if (mode === "editing" && editAction) return <EditBox text={text} action={editAction} onClose={close} />;
  if (mode === "confirmDelete" && deleteAction) return <ConfirmDelete action={deleteAction} onClose={close} />;

  // Os botões aparecem ao passar o mouse na mensagem (a linha da mensagem tem
  // `group`); em tela de toque ficam sempre visíveis — não existe "passar o mouse".
  return (
    <div className="flex items-center gap-3 mt-0.5 mr-1">
      <div className="flex items-center gap-3 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {editAction && (
          <button
            type="button"
            onClick={() => setMode("editing")}
            className="inline-flex items-center gap-1 text-[11px] text-wa-muted hover:text-wa-green"
          >
            <Pencil className="w-3 h-3" /> Editar
          </button>
        )}
        {deleteAction && (
          <button
            type="button"
            onClick={() => setMode("confirmDelete")}
            className="inline-flex items-center gap-1 text-[11px] text-wa-muted hover:text-status-critical"
          >
            <Trash2 className="w-3 h-3" /> Apagar
          </button>
        )}
      </div>
      <span className="text-[10px] text-wa-muted">{senderLabel}</span>
    </div>
  );
}
