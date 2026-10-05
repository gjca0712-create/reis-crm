"use client";

import { useRef, useState, type ClipboardEvent, type ChangeEvent, type KeyboardEvent } from "react";
import { Paperclip, SendHorizontal, X } from "lucide-react";

// Formulário de resposta do WhatsApp Suporte. Fica num client component à
// parte só por causa do anexo: colar uma imagem (Ctrl+V) ou escolher um
// arquivo precisa de estado local (preview do que foi anexado) e do truque de
// DataTransfer pra empurrar o arquivo colado pro <input type="file"> —
// nenhuma dessas duas coisas dá pra fazer só com HTML/server action.
// allowAttachments=false: só texto (chat interno da equipe).
export function ReplyForm({
  action,
  placeholder,
  allowAttachments = true,
}: {
  action: (formData: FormData) => void;
  placeholder: string;
  allowAttachments?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function attachFile(file: File) {
    if (!fileInputRef.current) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInputRef.current.files = transfer.files;
    setFileName(file.name);
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (!allowAttachments) return;
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    attachFile(new File([file], file.name || "print.png", { type: file.type }));
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFileName(e.target.files?.[0]?.name ?? null);
  }

  // Igual ao WhatsApp Web: Enter envia, Shift+Enter quebra a linha. Só com
  // teclado de verdade — no celular o Enter do teclado continua quebrando linha.
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    e.preventDefault();
    if (!e.currentTarget.value.trim() && !fileName) return;
    e.currentTarget.form?.requestSubmit();
  }

  function clearFile() {
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <form action={action} className="bg-wa-panel px-3 py-2.5 flex flex-col gap-2">
      {fileName && (
        <div className="flex items-center justify-between gap-2 text-xs bg-wa-active rounded-lg px-3 py-1.5">
          <span className="truncate text-wa-text">📎 {fileName}</span>
          <button
            type="button"
            onClick={clearFile}
            className="text-wa-muted hover:text-status-critical shrink-0"
            aria-label="Remover anexo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        {allowAttachments && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              name="media"
              id="wa-reply-media"
              onChange={handleFileChange}
              accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
            />
            <label
              htmlFor="wa-reply-media"
              className="shrink-0 p-2.5 rounded-full text-wa-muted hover:text-wa-text hover:bg-wa-active cursor-pointer transition-colors"
              title="Anexar arquivo"
            >
              <Paperclip className="w-5 h-5" />
            </label>
          </>
        )}
        <textarea
          name="body"
          rows={1}
          placeholder={placeholder}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          className="flex-1 resize-none max-h-40 rounded-lg bg-wa-active border-0 px-3 py-2.5 text-[15px] text-wa-text placeholder:text-wa-muted focus:outline-none focus:ring-1 focus:ring-wa-green/50"
        />
        <button
          type="submit"
          className="w-10 h-10 rounded-full bg-wa-green text-wa-bg flex items-center justify-center hover:brightness-110 transition shrink-0"
          aria-label="Enviar"
          title="Enviar (Enter)"
        >
          <SendHorizontal className="w-5 h-5" />
        </button>
      </div>
    </form>
  );
}
