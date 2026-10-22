"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Check, Copy, Loader2, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { setFeedbackAction } from "@/app/admin/(app)/consultor/actions";
import type { EventoConsultor } from "@/app/api/consultor/route";
import type { ConsultaFeita } from "@/lib/consultor/ferramentas";

export type MensagemConsultor = {
  id: string;
  role: "user" | "assistant";
  text: string;
  consultas: ConsultaFeita[];
  feedback: number | null;
};

const SUGESTOES = [
  "Como foram as vendas dos últimos 30 dias comparadas com os 30 anteriores?",
  "Monte 3 ofertas com o estoque parado, dentro das regras de margem.",
  "Quais produtos estão em falta e vendem bem?",
  "Quais clientes pararam de comprar e quanto eles gastavam?",
  "Sugira um combo com produtos que saem juntos.",
  "Como está o atendimento do WhatsApp nesta semana?",
];

// Estilo do markdown das respostas (tabelas, listas, negrito) no tema do CRM.
const MD: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-1">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-ink-primary">{children}</strong>,
  h1: ({ children }) => <h3 className="mt-4 mb-2 text-sm font-semibold text-ink-primary first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-4 mb-2 text-sm font-semibold text-ink-primary first:mt-0">{children}</h3>,
  h3: ({ children }) => <h3 className="mt-3 mb-1.5 text-sm font-semibold text-ink-primary first:mt-0">{children}</h3>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="bg-surface-raised px-2.5 py-1.5 text-left font-medium text-ink-secondary whitespace-nowrap">{children}</th>
  ),
  td: ({ children }) => <td className="border-t border-border px-2.5 py-1.5 tabular-nums">{children}</td>,
  code: ({ children }) => <code className="rounded bg-surface-raised px-1 py-0.5 text-xs">{children}</code>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-gold-400 underline">
      {children}
    </a>
  ),
};

function Resposta({ texto }: { texto: string }) {
  return (
    <div className="text-sm leading-relaxed text-ink-secondary">
      <Markdown remarkPlugins={[remarkGfm]} components={MD}>
        {texto}
      </Markdown>
    </div>
  );
}

function DadosUsados({ consultas }: { consultas: ConsultaFeita[] }) {
  if (consultas.length === 0) return null;
  return (
    <details className="mt-2 text-xs text-ink-muted">
      <summary className="cursor-pointer select-none hover:text-ink-secondary">Dados usados ({consultas.length})</summary>
      <ul className="mt-1.5 space-y-0.5 pl-4 list-disc">
        {consultas.map((c, i) => (
          <li key={i}>
            {c.rotulo}
            {c.detalhe && <span>: {c.detalhe}</span>}
            {c.erro && <span className="text-status-serious"> (falhou: {c.erro})</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function AcoesDaResposta({ mensagem }: { mensagem: MensagemConsultor }) {
  const [feedback, setFeedback] = useState(mensagem.feedback);
  const [copiado, setCopiado] = useState(false);

  async function avaliar(valor: 1 | -1) {
    const novo = feedback === valor ? 0 : valor;
    setFeedback(novo === 0 ? null : novo);
    const r = await setFeedbackAction(mensagem.id, novo);
    if (!r.ok) setFeedback(mensagem.feedback);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem.text);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // navegador sem permissão de área de transferência
    }
  }

  const botao = "rounded-md p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink-primary transition-colors";
  return (
    <div className="mt-2 flex items-center gap-0.5">
      <button type="button" onClick={() => avaliar(1)} className={cn(botao, feedback === 1 && "text-status-good")} title="Resposta boa" aria-pressed={feedback === 1}>
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => avaliar(-1)} className={cn(botao, feedback === -1 && "text-status-critical")} title="Resposta errada ou ruim" aria-pressed={feedback === -1}>
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={copiar} className={botao} title="Copiar resposta">
        {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export function ConsultorChat({
  conversaId,
  mensagensIniciais,
  bloqueio,
}: {
  conversaId: string | null;
  mensagensIniciais: MensagemConsultor[];
  // Motivo pra não aceitar pergunta agora (sem chave, limite do dia, conversa cheia).
  bloqueio: string | null;
}) {
  const router = useRouter();
  const [mensagens, setMensagens] = useState(mensagensIniciais);
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length, rascunho, status]);

  async function perguntar(texto: string) {
    const q = texto.trim();
    if (!q || enviando || bloqueio) return;
    setErro(null);
    setPergunta("");
    setEnviando(true);
    setStatus("Pensando…");
    setRascunho("");
    setMensagens((m) => [...m, { id: `local-${Date.now()}`, role: "user", text: q, consultas: [], feedback: null }]);

    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const res = await fetch("/api/consultor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversaId: conversaId ?? undefined, pergunta: q }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        const corpo = await res.json().catch(() => null);
        setErro(corpo?.erro ?? "Não consegui enviar a pergunta.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let novaConversa: string | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const linhas = buffer.split("\n");
        buffer = linhas.pop() ?? "";
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          const ev = JSON.parse(linha) as EventoConsultor;
          if (ev.tipo === "ferramenta") {
            // Texto antes de uma consulta é só a IA dizendo o que vai olhar.
            setRascunho("");
            setStatus(`Consultando: ${ev.rotulo}…`);
          } else if (ev.tipo === "texto") {
            setStatus(null);
            setRascunho((r) => r + ev.delta);
          } else if (ev.tipo === "fim") {
            setRascunho("");
            setMensagens((m) => [...m, { id: ev.mensagemId, role: "assistant", text: ev.texto, consultas: ev.consultas, feedback: null }]);
            if (!conversaId) novaConversa = ev.conversaId;
          } else if (ev.tipo === "erro") {
            setRascunho("");
            setErro(ev.mensagem);
          }
        }
      }
      if (novaConversa) router.replace(`/admin/consultor?c=${novaConversa}`, { scroll: false });
      router.refresh();
    } catch (err) {
      if (!abort.signal.aborted) {
        console.error(err);
        setErro("A conexão caiu no meio da resposta. Tente de novo.");
      }
    } finally {
      setEnviando(false);
      setStatus(null);
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    perguntar(pergunta);
  }

  function teclado(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      perguntar(pergunta);
    }
  }

  const vazio = mensagens.length === 0 && !enviando;

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[480px] flex-col rounded-2xl border border-border bg-surface">
      <div className="flex-1 overflow-y-auto px-4 py-5 lg:px-6">
        {vazio ? (
          <div className="mx-auto flex max-w-xl flex-col items-center pt-6 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gold-400/10 text-gold-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="mt-3 text-base font-semibold text-ink-primary">O que você quer analisar?</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Vendas, margem, estoque, clientes, parceiros, atendimento e ofertas. A IA consulta os números do ERP e do CRM antes de responder.
            </p>
            <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => perguntar(s)}
                  disabled={!!bloqueio}
                  className="rounded-xl border border-border bg-page px-3 py-2.5 text-left text-sm text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {mensagens.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-surface-raised px-4 py-2.5 text-sm text-ink-primary">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id}>
                  <Resposta texto={m.text} />
                  <DadosUsados consultas={m.consultas} />
                  {!m.id.startsWith("local-") && <AcoesDaResposta mensagem={m} />}
                </div>
              )
            )}
            {rascunho && <Resposta texto={rascunho} />}
            {status && (
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                {status}
              </div>
            )}
            {erro && (
              <div className="rounded-lg border border-status-critical/30 bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{erro}</div>
            )}
          </div>
        )}
        <div ref={fimRef} />
      </div>

      <form onSubmit={enviar} className="border-t border-border p-3 lg:p-4">
        {bloqueio ? (
          <p className="text-center text-sm text-ink-muted">{bloqueio}</p>
        ) : (
          <>
            <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-border-strong bg-page px-3 py-2 focus-within:border-gold-400/60">
              <textarea
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                onKeyDown={teclado}
                rows={1}
                maxLength={2000}
                placeholder="Pergunte sobre vendas, estoque, clientes, ofertas…"
                className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none [field-sizing:content]"
                disabled={enviando}
                aria-label="Pergunta para o Consultor IA"
              />
              <button
                type="submit"
                disabled={enviando || !pergunta.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-400 text-page transition-colors hover:bg-gold-300 disabled:opacity-40"
                aria-label="Enviar pergunta"
              >
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            </div>
            <p className="mx-auto mt-1.5 max-w-3xl text-[11px] text-ink-muted">
              A IA pode errar. Confira os números importantes antes de decidir.
            </p>
          </>
        )}
      </form>
    </div>
  );
}
