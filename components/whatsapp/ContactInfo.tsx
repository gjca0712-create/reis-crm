"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Pencil, UserRound, X } from "lucide-react";
import { ContactAvatar } from "./ContactAvatar";
import { BAIRROS_PADRAO, FASE_OBRA_LABELS } from "@/lib/constants";

type Contact = {
  id: string;
  name: string;
  // Número do atendimento (Conversation.number), ao lado do nome: #123.
  number?: number;
  phoneLabel: string;
  details: string;
  // "" quando ainda não informado.
  bairro: string;
  faseObra: string | null;
  referredById: string | null;
  notes: string | null;
  // Contato do WhatsApp ainda sem cadastro (Customer.isContact).
  isContact: boolean;
  // Falta nome ou bairro (lib/customers/contact.ts needsSignup).
  signupMissing: boolean;
  // O nome é só o telefone (perfil do WhatsApp sem nome): o campo vem vazio.
  nameIsPhone: boolean;
  customerSince: string;
  whatsappUrl: string;
};

export type PartnerOption = { id: string; label: string };

type Result = { error?: string };

const field =
  "w-full rounded-lg border border-wa-border bg-wa-bg px-3 py-2 text-sm text-wa-text placeholder:text-wa-muted/60 focus:outline-none focus:ring-1 focus:ring-wa-green";

// Topo da conversa: foto + nome. Clicando, abre "Dados do contato" do lado
// direito, como no WhatsApp: foto grande, recado e o que o CRM sabe do cliente
// — e dá pra completar o cadastro ali mesmo, sem sair da conversa.
export function ContactInfo({
  contact,
  canOpenCustomer,
  partners,
  save,
}: {
  contact: Contact;
  canOpenCustomer: boolean;
  partners: PartnerOption[];
  save: (formData: FormData) => Promise<Result>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [about, setAbout] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open(edit = false) {
    setEditing(edit);
    setError(null);
    dialog.current?.showModal();
    if (about !== undefined) return;
    fetch(`/api/whatsapp/contato/${contact.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { about: null }))
      .then((d: { about?: string | null }) => setAbout(d.about ?? null))
      .catch(() => setAbout(null));
  }

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await save(formData);
      if (result.error) setError(result.error);
      else setEditing(false);
    });
  }

  const partnerName = partners.find((p) => p.id === contact.referredById)?.label;

  return (
    <>
      <button
        type="button"
        onClick={() => open()}
        title="Dados do contato"
        className="flex items-center gap-3 min-w-0 text-left rounded-lg -m-1 p-1 hover:bg-wa-active/60 transition-colors"
      >
        <ContactAvatar customerId={contact.id} name={contact.name} className="w-10 h-10 text-base" />
        <span className="min-w-0">
          <span className="block text-[15px] font-medium text-wa-text truncate">
            {contact.name}
            {contact.number !== undefined && (
              <span className="text-[13px] font-normal text-wa-muted"> #{contact.number}</span>
            )}
          </span>
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
              {editing ? "Cadastro do cliente" : "Dados do contato"}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col items-center gap-1 bg-wa-list px-6 py-7">
              <ContactAvatar customerId={contact.id} name={contact.name} large className="w-40 h-40 text-5xl mb-3" />
              <div className="text-xl text-center break-words">{contact.name}</div>
              <div className="text-wa-muted">{contact.phoneLabel}</div>
              {contact.isContact && (
                <div className="mt-2 rounded-full bg-wa-panel px-3 py-1 text-xs text-wa-muted">
                  Contato do WhatsApp · ainda sem cadastro
                </div>
              )}
            </div>

            {editing ? (
              <form action={submit} className="mt-2 bg-wa-list px-6 py-4 space-y-3 text-sm">
                <label className="block">
                  <span className="block text-xs text-wa-muted mb-1">Nome</span>
                  <input
                    name="name"
                    required
                    defaultValue={contact.nameIsPhone ? "" : contact.name}
                    placeholder="Nome do cliente"
                    className={field}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-wa-muted mb-1">Bairro</span>
                  <input
                    name="bairro"
                    defaultValue={contact.bairro}
                    list="contato-bairros"
                    placeholder="Ex: Centro"
                    className={field}
                  />
                  <datalist id="contato-bairros">
                    {BAIRROS_PADRAO.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </label>
                <label className="block">
                  <span className="block text-xs text-wa-muted mb-1">Fase da obra</span>
                  <select name="faseObra" defaultValue={contact.faseObra ?? ""} className={field}>
                    <option value="">Não informado</option>
                    {Object.entries(FASE_OBRA_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs text-wa-muted mb-1">Indicado por</span>
                  <select name="referredById" defaultValue={contact.referredById ?? ""} className={field}>
                    <option value="">Ninguém (cliente direto)</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs text-wa-muted mb-1">Observações</span>
                  <textarea name="notes" rows={3} defaultValue={contact.notes ?? ""} className={field} />
                </label>
                {error && <p className="text-status-critical text-xs">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-lg px-3 py-2 text-wa-muted hover:text-wa-text"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-lg bg-wa-green px-4 py-2 font-medium text-wa-bg hover:brightness-110 disabled:opacity-60"
                  >
                    {pending ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </form>
            ) : (
              <>
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
                  <InfoLine label="Bairro" value={contact.bairro} />
                  <InfoLine
                    label="Fase da obra"
                    value={contact.faseObra ? (FASE_OBRA_LABELS[contact.faseObra] ?? contact.faseObra) : ""}
                  />
                  {partnerName && <InfoLine label="Indicado por" value={partnerName} />}
                  {contact.notes && <InfoLine label="Observações" value={contact.notes} />}
                  <InfoLine label={contact.isContact ? "Contato desde" : "Cliente desde"} value={contact.customerSince} />
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 font-medium ${
                      contact.signupMissing
                        ? "bg-wa-green text-wa-bg hover:brightness-110"
                        : "border border-wa-border text-wa-text hover:bg-wa-panel"
                    }`}
                  >
                    <Pencil className="w-4 h-4" /> {contact.signupMissing ? "Completar cadastro" : "Editar cadastro"}
                  </button>
                </div>
              </>
            )}

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

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-wa-muted">{label}</div>
      <div className={`break-words ${value ? "" : "text-wa-muted"}`}>{value || "Não informado"}</div>
    </div>
  );
}
