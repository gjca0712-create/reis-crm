"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, UserRound, X } from "lucide-react";
import { ContactAvatar } from "./ContactAvatar";

type Contact = {
  id: string;
  name: string;
  phoneLabel: string;
  details: string;
  bairro: string;
  customerSince: string;
  whatsappUrl: string;
};

// Topo da conversa: foto + nome. Clicando, abre "Dados do contato" do lado
// direito, como no WhatsApp: foto grande, recado e o que o CRM sabe do cliente.
export function ContactInfo({ contact, canOpenCustomer }: { contact: Contact; canOpenCustomer: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [about, setAbout] = useState<string | null | undefined>(undefined);

  function open() {
    dialog.current?.showModal();
    if (about !== undefined) return;
    fetch(`/api/whatsapp/contato/${contact.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { about: null }))
      .then((d: { about?: string | null }) => setAbout(d.about ?? null))
      .catch(() => setAbout(null));
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="Dados do contato"
        className="flex items-center gap-3 min-w-0 text-left rounded-lg -m-1 p-1 hover:bg-wa-active/60 transition-colors"
      >
        <ContactAvatar customerId={contact.id} name={contact.name} className="w-10 h-10 text-base" />
        <span className="min-w-0">
          <span className="block text-[15px] font-medium text-wa-text truncate">{contact.name}</span>
          <span className="block text-xs text-wa-muted truncate">{contact.details}</span>
        </span>
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="contato-titulo"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="m-0 ml-auto h-dvh max-h-none w-[min(24rem,100vw)] border-l border-wa-border bg-wa-bg p-0 text-wa-text backdrop:bg-black/50"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 bg-wa-panel px-4 h-14 shrink-0">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="text-wa-muted hover:text-wa-text"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 id="contato-titulo" className="text-base font-medium">
              Dados do contato
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col items-center gap-1 bg-wa-list px-6 py-7">
              <ContactAvatar customerId={contact.id} name={contact.name} large className="w-40 h-40 text-5xl mb-3" />
              <div className="text-xl text-center break-words">{contact.name}</div>
              <div className="text-wa-muted">{contact.phoneLabel}</div>
            </div>

            <div className="mt-2 bg-wa-list px-6 py-4">
              <div className="text-xs text-wa-muted mb-1">Recado</div>
              <div className="text-sm break-words">
                {about === undefined ? (
                  <span className="text-wa-muted">Carregando...</span>
                ) : about ? (
                  about
                ) : (
                  <span className="text-wa-muted">Sem recado (ou escondido pelo contato)</span>
                )}
              </div>
            </div>

            <div className="mt-2 bg-wa-list px-6 py-4 space-y-3 text-sm">
              <div>
                <div className="text-xs text-wa-muted">Bairro</div>
                <div>{contact.bairro}</div>
              </div>
              <div>
                <div className="text-xs text-wa-muted">Cliente desde</div>
                <div>{contact.customerSince}</div>
              </div>
            </div>

            <div className="mt-2 bg-wa-list py-2 text-sm">
              {canOpenCustomer && (
                <Link
                  href={`/admin/clientes/${contact.id}`}
                  className="flex items-center gap-4 px-6 py-3 hover:bg-wa-panel"
                >
                  <UserRound className="w-4 h-4 text-wa-muted" /> Abrir ficha do cliente
                </Link>
              )}
              <a
                href={contact.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 px-6 py-3 hover:bg-wa-panel"
              >
                <ExternalLink className="w-4 h-4 text-wa-muted" /> Abrir no WhatsApp
              </a>
              <Link
                href={`/admin/ocorrencias/novo?clienteId=${contact.id}`}
                className="flex items-center gap-4 px-6 py-3 text-status-critical hover:bg-wa-panel"
              >
                <AlertTriangle className="w-4 h-4" /> Registrar ocorrência
              </Link>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
