"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, UserPlus, X } from "lucide-react";
import { formatPhone, onlyDigits } from "@/lib/format";
import { normalizePhone, phoneVariants } from "@/lib/phone";
import { searchChatCustomers, startConversation } from "@/app/admin/(app)/whatsapp/suporte/actions";
import type { ChatCustomerOption } from "@/lib/whatsapp/start-conversation";

type Line = { id: string; label: string; connected: boolean };
// Sem id = contato novo (só o telefone digitado).
type Recipient = { id?: string; name: string; phone: string };

// "Nova conversa" do WhatsApp Suporte: escolhe o cliente (busca por nome ou
// telefone, ou um número novo), a linha e escreve a primeira mensagem.
// <dialog> nativo, igual ao ChatImage: sobrevive ao AutoRefresh da tela sem
// perder o que foi digitado. Campos controlados de propósito — o React limpa
// campo não controlado ao fim da action, e dando erro o texto sumiria.
// initialCustomer + autoOpen: vindo da ficha do cliente (?novo=<id>).
export function NewConversationDialog({
  lines,
  initialCustomer,
  autoOpen = false,
}: {
  lines: Line[];
  initialCustomer?: ChatCustomerOption | null;
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [recipient, setRecipient] = useState<Recipient | null>(initialCustomer ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatCustomerOption[]>([]);
  const [newName, setNewName] = useState("");
  const [body, setBody] = useState("");
  const firstConnected = lines.find((l) => l.connected)?.id ?? "";
  const [line, setLine] = useState(firstConnected);
  const [state, formAction, pending] = useActionState(startConversation, undefined);

  // Linha escolhida caiu (ou nenhuma estava conectada ao abrir): passa pra uma conectada.
  const lineOk = lines.some((l) => l.id === line && l.connected);
  useEffect(() => {
    if (!lineOk && firstConnected) setLine(firstConnected);
  }, [lineOk, firstConnected]);

  useEffect(() => {
    if (!autoOpen) return;
    dialog.current?.showModal();
    // Tira o ?novo= da URL: senão um F5 depois reabriria a janela.
    const url = new URL(window.location.href);
    url.searchParams.delete("novo");
    window.history.replaceState(null, "", url);
  }, [autoOpen]);

  // Busca enquanto digita (espera parar um instante; resposta velha é descartada).
  useEffect(() => {
    if (recipient || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let stale = false;
    const t = setTimeout(async () => {
      const found = await searchChatCustomers(query).catch(() => []);
      if (!stale) setResults(found);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query, recipient]);

  useEffect(() => {
    if (!state || !("conversationId" in state)) return;
    dialog.current?.close();
    setRecipient(null);
    setQuery("");
    setNewName("");
    setBody("");
    router.push(`/admin/whatsapp/suporte?c=${state.conversationId}`);
  }, [state, router]);

  // Número completo digitado que não é de ninguém da lista: oferece como contato novo.
  const typedPhone = normalizePhone(onlyDigits(query));
  const typedVariants = phoneVariants(typedPhone);
  const offerNew =
    (typedPhone.length === 10 || typedPhone.length === 11) && !results.some((c) => typedVariants.includes(c.phone));

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex items-center gap-2 rounded-lg bg-gold-400 text-page font-semibold px-4 py-2 text-sm hover:bg-gold-300 transition-colors"
      >
        <MessageSquarePlus className="w-4 h-4" /> Nova conversa
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="nova-conversa-titulo"
        className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-ink-primary backdrop:bg-black/70"
      >
        <form action={formAction} className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="nova-conversa-titulo" className="text-base font-semibold">
              Nova conversa
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="text-ink-muted hover:text-ink-primary"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-ink-secondary">Cliente</span>
            {recipient ? (
              <div className="rounded-lg border border-border bg-surface-raised px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{recipient.id ? recipient.name : "Contato novo"}</div>
                    <div className="text-xs text-ink-muted">{formatPhone(recipient.phone)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRecipient(null)}
                    className="text-xs text-gold-400 hover:text-gold-300 shrink-0"
                  >
                    Trocar
                  </button>
                </div>
                {!recipient.id && (
                  <input
                    name="name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nome do cliente (opcional)"
                    className="mt-2 w-full rounded-lg bg-page border border-border px-3 py-2 text-sm placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50"
                  />
                )}
                {recipient.id ? (
                  <input type="hidden" name="customerId" value={recipient.id} />
                ) : (
                  <input type="hidden" name="phone" value={recipient.phone} />
                )}
              </div>
            ) : (
              <>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nome ou telefone"
                  autoComplete="off"
                  className="w-full rounded-lg bg-page border border-border px-3 py-2.5 text-sm placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50"
                />
                {(results.length > 0 || offerNew) && (
                  <ul className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
                    {results.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setRecipient(c)}
                          className="w-full px-3 py-2 text-left hover:bg-surface-raised"
                        >
                          <span className="block text-sm truncate">{c.name}</span>
                          <span className="block text-xs text-ink-muted">{formatPhone(c.phone)}</span>
                        </button>
                      </li>
                    ))}
                    {offerNew && (
                      <li>
                        <button
                          type="button"
                          onClick={() => setRecipient({ name: "", phone: typedPhone })}
                          className="w-full px-3 py-2 text-left hover:bg-surface-raised flex items-center gap-2 text-sm text-gold-400"
                        >
                          <UserPlus className="w-4 h-4 shrink-0" /> Conversar com {formatPhone(typedPhone)} (contato
                          novo)
                        </button>
                      </li>
                    )}
                  </ul>
                )}
                {query.trim().length >= 2 && results.length === 0 && !offerNew && (
                  <p className="text-xs text-ink-muted">
                    Ninguém com esse nome. Pra um contato novo, digite o telefone com DDD.
                  </p>
                )}
              </>
            )}
          </div>

          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-xs font-medium text-ink-secondary">Mandar pela</legend>
            <div className="flex gap-1">
              {lines.map((l) => (
                <label
                  key={l.id}
                  className={`flex-1 rounded-md px-2 py-1.5 text-center text-xs font-medium transition-colors ${
                    !l.connected
                      ? "bg-surface-raised text-ink-muted opacity-60 cursor-not-allowed"
                      : line === l.id
                        ? "bg-gold-400 text-page cursor-pointer"
                        : "bg-surface-raised text-ink-secondary hover:text-ink-primary cursor-pointer"
                  }`}
                >
                  <input
                    type="radio"
                    name="line"
                    value={l.id}
                    checked={line === l.id}
                    disabled={!l.connected}
                    onChange={() => setLine(l.id)}
                    className="sr-only"
                  />
                  {l.label}
                  {!l.connected && " · desconectada"}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-ink-secondary">Mensagem</span>
            <textarea
              name="body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Olá! Aqui é da Reis Materiais de Construção..."
              className="w-full resize-y rounded-lg bg-page border border-border px-3 py-2.5 text-sm placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50"
            />
          </label>

          <p className="text-xs text-ink-muted">
            Use com clientes que conhecem a loja. Mensagem que a pessoa não espera, e que ela denuncia como spam, é o
            que mais leva o WhatsApp a bloquear o número.
          </p>

          {state && "error" in state && (
            <p className="rounded-lg border border-status-critical/30 bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-lg px-4 py-2 text-sm text-ink-secondary hover:text-ink-primary hover:bg-surface-raised"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || !recipient || !body.trim() || !lineOk}
              className="rounded-lg bg-gold-400 text-page font-semibold px-4 py-2 text-sm hover:bg-gold-300 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              {pending ? "Enviando..." : "Enviar"}
            </button>
          </div>
          {!firstConnected && (
            <p className="text-xs text-status-critical -mt-2 text-right">Nenhuma linha conectada no momento.</p>
          )}
        </form>
      </dialog>
    </>
  );
}
