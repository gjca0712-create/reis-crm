"use client";

import { useRef } from "react";
import { Download, ExternalLink, X } from "lucide-react";

// Foto da conversa: miniatura no balão e, no clique, a imagem inteira por cima
// da tela — Esc, clique fora ou "Fechar" fecham. <dialog> nativo de propósito:
// fica acima de tudo mesmo dentro do balão (overflow escondido) e o Esc já vem
// pronto. Sobrevive ao AutoRefresh da tela (o estado de aberto é do navegador).
export function ChatImage({ src, alt, fileName }: { src: string; alt: string; fileName?: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="block mb-1.5 cursor-zoom-in"
        title="Abrir imagem"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="rounded-lg max-w-full max-h-64 object-contain" />
      </button>

      <dialog
        ref={dialog}
        // Clique fora da foto e da barra de botões fecha.
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("img, a, button")) close();
        }}
        className="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-black/85"
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-[calc(100dvh-6rem)] max-w-full rounded-lg object-contain" />
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-raised px-3 py-2 text-ink-primary hover:bg-surface"
            >
              <ExternalLink className="w-4 h-4" /> Abrir em nova aba
            </a>
            <a
              href={src}
              download={fileName || true}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-raised px-3 py-2 text-ink-primary hover:bg-surface"
            >
              <Download className="w-4 h-4" /> Baixar
            </a>
            <button
              type="button"
              onClick={close}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-raised px-3 py-2 text-ink-primary hover:bg-surface"
            >
              <X className="w-4 h-4" /> Fechar
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
