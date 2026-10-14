"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type ChangeEvent, type KeyboardEvent } from "react";
import { Loader2, Mic, Paperclip, SendHorizontal, Square, Trash2, X } from "lucide-react";
import { LEVEL_BARS, canRecordVoice, useVoiceRecorder } from "./useVoiceRecorder";

// Formulário de resposta do WhatsApp Suporte. Fica num client component à
// parte por causa do anexo e da mensagem de voz: colar uma imagem (Ctrl+V) ou
// escolher um arquivo precisa de estado local (preview do que foi anexado) e do
// truque de DataTransfer pra empurrar o arquivo pro <input type="file"> — o
// áudio gravado (useVoiceRecorder) vai pelo mesmo campo, com voice=1.
// Igual ao WhatsApp Web: sem texto nem anexo, o botão de enviar vira o microfone.
// allowAttachments=false: só texto (chat interno da equipe) — sem áudio também.
export function ReplyForm({
  action,
  placeholder,
  allowAttachments = true,
}: {
  action: (formData: FormData) => void;
  placeholder: string;
  allowAttachments?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceFlagRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [hasText, setHasText] = useState(false);
  // Só depois de montar: no servidor não dá pra saber se o navegador grava.
  const [canRecord, setCanRecord] = useState(false);
  const voice = useVoiceRecorder();

  useEffect(() => setCanRecord(allowAttachments && canRecordVoice()), [allowAttachments]);

  function putFile(file: File) {
    if (!fileInputRef.current) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInputRef.current.files = transfer.files;
  }

  function attachFile(file: File) {
    putFile(file);
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

  // Manda o áudio pelo mesmo formulário: o arquivo no campo "media" e voice=1
  // (o servidor confere se é Ogg/Opus de verdade antes de mandar como voz).
  async function sendVoice() {
    if (voice.state === "sending") return;
    const r = await voice.take();
    if (!r || !formRef.current) return;
    putFile(r.file);
    if (voiceFlagRef.current) voiceFlagRef.current.value = r.voiceNote ? "1" : "";
    formRef.current.requestSubmit();
  }

  const voiceActive = voice.state !== "idle";
  const showMic = canRecord && !hasText && !fileName;

  return (
    <form ref={formRef} action={action} className="bg-wa-panel px-3 py-2.5 flex flex-col gap-2">
      {fileName && !voiceActive && (
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
      {voice.error && (
        <div role="alert" className="flex items-start justify-between gap-2 text-xs text-status-critical bg-status-critical/10 rounded-lg px-3 py-1.5">
          <span>{voice.error}</span>
          <button type="button" onClick={voice.clearError} className="shrink-0 hover:brightness-125" aria-label="Fechar aviso">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
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
          <input ref={voiceFlagRef} type="hidden" name="voice" defaultValue="" />
        </>
      )}

      {voiceActive ? (
        <VoiceBar voice={voice} onSend={sendVoice} />
      ) : (
        <div className="flex items-end gap-2">
          {allowAttachments && (
            <label
              htmlFor="wa-reply-media"
              className="shrink-0 p-2.5 rounded-full text-wa-muted hover:text-wa-text hover:bg-wa-active cursor-pointer transition-colors"
              title="Anexar arquivo"
            >
              <Paperclip className="w-5 h-5" />
            </label>
          )}
          <textarea
            name="body"
            rows={1}
            placeholder={placeholder}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onChange={(e) => setHasText(e.target.value.trim().length > 0)}
            className="flex-1 resize-none max-h-40 rounded-lg bg-wa-active border-0 px-3 py-2.5 text-[15px] text-wa-text placeholder:text-wa-muted focus:outline-none focus:ring-1 focus:ring-wa-green/50"
          />
          {showMic ? (
            <button
              type="button"
              onClick={() => void voice.start()}
              className="w-10 h-10 rounded-full bg-wa-green text-wa-bg flex items-center justify-center hover:brightness-110 transition shrink-0"
              aria-label="Gravar mensagem de voz"
              title="Gravar mensagem de voz"
            >
              <Mic className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="submit"
              className="w-10 h-10 rounded-full bg-wa-green text-wa-bg flex items-center justify-center hover:brightness-110 transition shrink-0"
              aria-label="Enviar"
              title="Enviar (Enter)"
            >
              <SendHorizontal className="w-5 h-5" />
            </button>
          )}
        </div>
      )}
    </form>
  );
}

function formatClock(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Faixa no lugar da caixa de texto enquanto grava: descartar, ponto vermelho +
// tempo + nível do som, parar (pra ouvir antes) e enviar. Parado, mostra o
// player pra ouvir e as mesmas opções de descartar/enviar.
function VoiceBar({ voice, onSend }: { voice: ReturnType<typeof useVoiceRecorder>; onSend: () => void }) {
  const sending = voice.state === "sending";
  const bars = [...Array<number>(Math.max(0, LEVEL_BARS - voice.levels.length)).fill(0), ...voice.levels];

  return (
    <div className="flex items-center gap-2 min-h-10">
      <button
        type="button"
        onClick={voice.cancel}
        disabled={sending}
        className="shrink-0 p-2.5 rounded-full text-wa-muted hover:text-status-critical hover:bg-wa-active transition-colors disabled:opacity-40"
        aria-label="Descartar áudio"
        title="Descartar"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      <div className="flex-1 min-w-0 flex items-center gap-3 rounded-lg bg-wa-active px-3 h-10">
        {voice.state === "starting" ? (
          <span className="flex items-center gap-2 text-sm text-wa-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Abrindo o microfone…
          </span>
        ) : voice.state === "review" && voice.recorded ? (
          <audio src={voice.recorded.url} controls className="w-full h-8" />
        ) : sending ? (
          <span className="flex items-center gap-2 text-sm text-wa-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Enviando áudio…
          </span>
        ) : (
          <>
            <span className="w-2.5 h-2.5 rounded-full bg-[rgb(244,63,94)] animate-pulse shrink-0" aria-hidden />
            <span className="text-sm text-wa-text tabular-nums shrink-0" aria-live="off">
              {formatClock(voice.seconds)}
            </span>
            <span className="flex-1 min-w-0 flex items-center justify-end gap-[2px] h-6 overflow-hidden" aria-hidden>
              {bars.map((level, i) => (
                <span
                  key={i}
                  className="w-[3px] shrink-0 rounded-full bg-wa-muted"
                  style={{ height: `${Math.max(12, Math.round(level * 100))}%` }}
                />
              ))}
            </span>
          </>
        )}
      </div>

      {voice.state === "recording" && (
        <button
          type="button"
          onClick={() => void voice.stop()}
          className="shrink-0 p-2.5 rounded-full text-[rgb(244,63,94)] hover:bg-wa-active transition-colors"
          aria-label="Parar e ouvir antes de enviar"
          title="Parar e ouvir"
        >
          <Square className="w-5 h-5 fill-current" />
        </button>
      )}
      <button
        type="button"
        onClick={onSend}
        disabled={sending || voice.state === "starting"}
        className="w-10 h-10 rounded-full bg-wa-green text-wa-bg flex items-center justify-center hover:brightness-110 transition shrink-0 disabled:opacity-50"
        aria-label="Enviar áudio"
        title="Enviar áudio"
      >
        {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <SendHorizontal className="w-5 h-5" />}
      </button>
    </div>
  );
}
