import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { formatPhone } from "@/lib/format";
import { whatsappLineLabel } from "@/lib/whatsapp/lines";
import { Card } from "@/components/ui/Card";
import { QUEUE_SECTION_EMPTY, QUEUE_SECTION_LABELS, type QueueSection } from "@/lib/whatsapp/queue";

// Fundo bem fraco em cada conversa da lista, só pra identificar o estado de
// relance (o texto continua legível normal): vermelho = cliente esperando
// resposta, amarelo = já respondida (ainda aberta), verde = finalizada.
// Classes completas aqui pro Tailwind enxergar. Vermelho rosado e amarelo limão
// de propósito (não os status-critical/warning): sobre o fundo marrom escuro,
// o vermelho alaranjado e o amarelo dourado viram dois tons de marrom quase iguais.
const ROW_TONES = {
  unanswered: {
    idle: "bg-[rgba(244,63,94,0.14)] hover:bg-[rgba(244,63,94,0.2)]",
    active: "bg-[rgba(244,63,94,0.26)]",
  },
  inProgress: {
    idle: "bg-[rgba(250,204,21,0.09)] hover:bg-[rgba(250,204,21,0.14)]",
    active: "bg-[rgba(250,204,21,0.18)]",
  },
  resolved: { idle: "bg-status-good/10 hover:bg-status-good/15", active: "bg-status-good/20" },
} as const;

// Legenda das cores acima (a página mostra junto do título).
export function QueueLegend({ showResolved }: { showResolved: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm bg-[rgba(244,63,94,0.5)]" /> Sem resposta
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm bg-[rgba(250,204,21,0.45)]" /> Respondida
      </span>
      {showResolved && (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-status-good/40" /> Finalizada
        </span>
      )}
    </div>
  );
}

export type QueueConversation = {
  id: string;
  status: string;
  line: string;
  customer: { name: string; phone: string };
  rating: { score: number } | null;
  assignedTo: { id: string; name: string } | null;
  // Só a última mensagem (sem as apagadas): IN = o cliente falou por último.
  messages: { direction: string }[];
};

type Sections<T> = { section: QueueSection; conversations: T[] }[];

// As duas colunas da fila, antes do chat: "Em espera" (ninguém assumiu) e "Em
// atendimento" (com você; CEO/Gerente veem também as da equipe e as
// finalizadas, recolhidas). Devolve os dois Cards soltos — quem posiciona é o
// grid da página.
export function QueueColumns<T extends QueueConversation>({
  sections,
  activeId,
  userId,
}: {
  sections: Sections<T>;
  activeId: string | undefined;
  userId: string;
}) {
  const waiting = sections.find((s) => s.section === "waiting")?.conversations ?? [];
  const current = sections.filter((s) => s.section !== "waiting");
  const inProgress = current.filter((s) => s.section !== "resolved").reduce((n, s) => n + s.conversations.length, 0);
  // Atendente só tem "Com você" nessa coluna: o título já diz, sem subtítulo.
  const onlyMine = current.length === 1 && current[0].section === "mine";

  const row = (c: T) => <QueueRow key={c.id} conversation={c} active={c.id === activeId} userId={userId} />;
  const rowsOrEmpty = (rows: T[], empty: string | undefined) =>
    rows.length > 0 ? rows.map(row) : empty ? <p className="px-4 py-3 text-xs text-ink-muted">{empty}</p> : null;

  return (
    <>
      <QueueColumn title="Em espera" count={waiting.length} alert={waiting.length > 0}>
        {rowsOrEmpty(waiting, QUEUE_SECTION_EMPTY.waiting)}
      </QueueColumn>

      <QueueColumn title="Em atendimento" count={inProgress}>
        {onlyMine
          ? rowsOrEmpty(current[0].conversations, QUEUE_SECTION_EMPTY.mine)
          : current.map(({ section, conversations: rows }) => {
              const empty = QUEUE_SECTION_EMPTY[section];
              if (rows.length === 0 && !empty) return null;
              const header = (
                <>
                  <span className="inline-flex items-center gap-1">
                    {section === "resolved" && (
                      <ChevronDown className="w-3.5 h-3.5 -rotate-90 transition-transform group-open:rotate-0" />
                    )}
                    {QUEUE_SECTION_LABELS[section]}
                  </span>
                  <span className="text-ink-muted">{rows.length}</span>
                </>
              );
              const headerClass =
                "sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-surface-raised px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary";

              // Finalizadas começam recolhidas: é histórico, e empurraria a
              // fila pra baixo. Abre sozinha se a conversa à direita está nela.
              if (section === "resolved") {
                return (
                  <details key={section} className="group" open={rows.some((c) => c.id === activeId)}>
                    <summary className={`${headerClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                      {header}
                    </summary>
                    {rowsOrEmpty(rows, empty)}
                  </details>
                );
              }
              return (
                <section key={section}>
                  <div className={headerClass}>{header}</div>
                  {rowsOrEmpty(rows, empty)}
                </section>
              );
            })}
      </QueueColumn>
    </>
  );
}

function QueueColumn({
  title,
  count,
  alert = false,
  children,
}: {
  title: string;
  count: number;
  alert?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="p-0 overflow-hidden flex flex-col min-h-0 max-h-80 lg:max-h-none">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
        <h2 className="text-sm font-semibold text-ink-primary">{title}</h2>
        <span
          className={`rounded-full px-2 text-xs font-semibold ${
            alert ? "bg-[rgba(244,63,94,0.3)] text-ink-primary" : "bg-surface-raised text-ink-muted"
          }`}
        >
          {count}
        </span>
      </div>
      <div className="overflow-y-auto flex-1 min-h-0">{children}</div>
    </Card>
  );
}

// Uma linha da lista: cor pelo estado (ver ROW_TONES) e negrito quando o
// cliente falou por último (ainda sem resposta), igual o próprio WhatsApp.
function QueueRow({
  conversation: c,
  active,
  userId,
}: {
  conversation: QueueConversation;
  active: boolean;
  userId: string;
}) {
  const unanswered = c.messages[0]?.direction === "IN";
  const tone = c.status === "RESOLVED" ? ROW_TONES.resolved : unanswered ? ROW_TONES.unanswered : ROW_TONES.inProgress;
  return (
    <Link
      href={`/admin/whatsapp/suporte?c=${c.id}`}
      className={`flex items-start gap-3 px-4 py-3 border-b border-border/60 transition-colors ${
        active ? `${tone.active} shadow-[inset_3px_0_0_0_#D4AF37]` : tone.idle
      }`}
    >
      <div className="w-9 h-9 rounded-full bg-gold-400/15 border border-gold-700/40 flex items-center justify-center text-xs font-semibold text-gold-400 shrink-0">
        {c.customer.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <span className={`block text-sm text-ink-primary truncate ${unanswered ? "font-semibold" : "font-normal"}`}>
          {c.customer.name}
        </span>
        <div
          className={`text-xs truncate ${unanswered ? "text-ink-primary font-semibold" : "text-ink-muted font-normal"}`}
        >
          {formatPhone(c.customer.phone)}
          <span className={unanswered ? "" : "text-ink-secondary"}> · {whatsappLineLabel(c.line)}</span>
          {c.rating && <span className="text-gold-400"> · {c.rating.score}★</span>}
        </div>
        {/* Com você já é a coluna; aqui só quando é de um colega — linha
            própria, senão a coluna estreita corta o nome. */}
        {c.assignedTo && c.assignedTo.id !== userId && (
          <div className="text-[11px] text-gold-400 truncate">Com {c.assignedTo.name}</div>
        )}
      </div>
    </Link>
  );
}
