"use client";

import { useRef, useState, type ClipboardEvent, type ChangeEvent } from "react";
import { Paperclip, X } from "lucide-react";

// Formulário de resposta do WhatsApp Suporte. Fica num client component à
// parte só por causa do anexo: colar uma imagem (Ctrl+V) ou escolher um
// arquivo precisa de estado local (preview do que foi anexado) e do truque de
// DataTransfer pra empurrar o arquivo colado pro <input type="file"> —
// nenhuma dessas duas coisas dá pra fazer só com HTML/server action.
export function ReplyForm({
  action,
  formKey,
  placeholder,
}: {
  action: (formData: FormData) => void;
  formKey: string;
  placeholder: string;
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

  function clearFile() {
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <form key={formKey} action={action} className="border-t border-border p-3 flex flex-col gap-2">
      {fileName && (
        <div className="flex items-center justify-between gap-2 text-xs bg-surface-raised rounded-lg px-3 py-1.5">
          <span className="truncate text-ink-secondary">📎 {fileName}</span>
          <button
            type="button"
            onClick={clearFile}
            className="text-ink-muted hover:text-status-critical shrink-0"
            aria-label="Remover anexo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          name="media"
          id="wa-reply-media"
          onChange={handleFileChange}
          accept="image/*,video/*,audio/*,application/pdf"
          className="hidden"
        />
        <label
          htmlFor="wa-reply-media"
          className="shrink-0 p-2.5 rounded-lg border border-border text-ink-muted hover:text-gold-400 hover:border-gold-700/40 cursor-pointer transition-colors"
          title="Anexar arquivo"
        >
          <Paperclip className="w-4 h-4" />
        </label>
        <textarea
          name="body"
          rows={1}
          placeholder={placeholder}
          onPaste={handlePaste}
          className="flex-1 resize-none rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50"
        />
        <button
          type="submit"
          className="rounded-lg bg-gold-400 text-page font-semibold px-4 py-2.5 text-sm hover:bg-gold-300 transition-colors shrink-0"
        >
          Enviar
        </button>
      </div>
    </form>
  );
}
