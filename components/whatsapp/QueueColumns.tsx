import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown, Camera, Video, Mic, FileText } from "lucide-react";
import { formatListTime, formatPhone, formatWaitingTime } from "@/lib/format";
import { whatsappLineLabel } from "@/lib/whatsapp/lines";
import { sectorLabel } from "@/lib/whatsapp/sectors";
import { closingKind } from "@/lib/whatsapp/closing";
import { QUEUE_SECTION_EMPTY, QUEUE_SECTION_LABELS, type QueueSection } from "@/lib/whatsapp/queue";

// Listas com a cara do WhatsApp Web (cores wa-* no tailwind.config). O estado
// de cada conversa fica numa faixa fina à esquerda, pra identificar de relance:
// vermelho = cliente esperando resposta, amarelo = já respondida (ainda
// aberta), verde = finalizada. Vermelho rosado e amarelo limão de propósito —
// sobre o fundo escuro ficam bem distintos um do outro.
const STATE_BAR = {
  unanswered: "bg-[rgb(244,63,94)]",
  inProgress: "bg-[rgb(250,204,21)]",
  resolved: "bg-status-good",
} as const;

// Legenda das cores acima (a página mostra junto do título).
export function QueueLegend({ showResolved }: { showResolved: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className={`w-1 h-3 rounded-full ${STATE_BAR.unanswered}`} /> Sem resposta
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`w-1 h-3 rounded-full ${STATE_BAR.inProgress}`} /> Respondida
      </span>
      {showResolved && (
        <span className="inline-flex items-center gap-1.5">
          <span className={`w-1 h-3 rounded-full ${STATE_BAR.resolved}`} /> Finalizada
        </span>
      )}
    </div>
  );
}

type ListMessage = { direction: string; body: string; mediaType: string | null; createdAt: Date };

export type QueueConversation = {
  id: string;
  status: string;
  line: string;
  sector: string | null;
  lastMessageAt: Date;
  customer: { name: string; phone: string };
  rating: { score: number } | null;
  assignedTo: { id: string; name: string } | null;
  // Últimas mensagens (sem as apagadas), da mais nova pra mais velha: a
  // primeira dá a prévia e se o cliente falou por último (IN = sem resposta);
  // a sequência de IN no começo dá desde quando ele espera.
  messages: ListMessage[];
};

type Sections<T> = { section: QueueSection; conversations: T[] }[];

// As duas colunas da fila, antes do chat: "Em espera" (ninguém assumiu) e "Em
// atendimento" (as que estão com quem está logado; na visão "Equipe" de
// CEO/Gerente, também as dos colegas e as finalizadas, recolhidas).
// currentToolbar: faixa logo abaixo do título de Em atendimento (a chave
// Meus/Equipe da página). Devolve as duas colunas soltas — quem posiciona é o
// grid da página.
export function QueueColumns<T extends QueueConversation>({
  sections,
  activeId,
  userId,
  currentToolbar,
}: {
  sections: Sections<T>;
  activeId: string | undefined;
  userId: string;
  currentToolbar?: ReactNode;
}) {
  const now = new Date();
  const waiting = sections.find((s) => s.section === "waiting")?.conversations ?? [];
  const current = sections.filter((s) => s.section !== "waiting");
  const inProgress = current.filter((s) => s.section !== "resolved").reduce((n, s) => n + s.conversations.length, 0);
  // Atendente só tem "Com você" nessa coluna: o título já diz, sem subtítulo.
  const onlyMine = current.length === 1 && current[0].section === "mine";

  const row = (c: T) => <QueueRow key={c.id} conversation={c} active={c.id === activeId} userId={userId} now={now} />;
  const rowsOrEmpty = (rows: T[], empty: string | undefined) =>
    rows.length > 0 ? rows.map(row) : empty ? <p className="px-4 py-3 text-xs text-wa-muted">{empty}</p> : null;

  return (
    <>
      <QueueColumn title="Em espera" count={waiting.length} alert={waiting.length > 0}>
        {rowsOrEmpty(waiting, QUEUE_SECTION_EMPTY.waiting)}
      </QueueColumn>

      <QueueColumn title="Em atendimento" count={inProgress} toolbar={currentToolbar}>
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
                  <span>{rows.length}</span>
                </>
              );
              const headerClass =
                "sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-wa-border bg-wa-list px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-wa-green";

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
  toolbar,
  children,
}: {
  title: string;
  count: number;
  alert?: boolean;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-wa-border bg-wa-list overflow-hidden flex flex-col min-h-0 max-h-80 lg:max-h-none">
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-wa-panel">
        <h2 className="text-[15px] font-medium text-wa-text">{title}</h2>
        <span
          className={`min-w-[22px] rounded-full px-1.5 text-center text-xs font-semibold leading-[22px] ${
            alert ? "bg-wa-green text-wa-bg" : "bg-wa-active text-wa-muted"
          }`}
        >
          {count}
        </span>
      </div>
      {toolbar}
      <div className="overflow-y-auto flex-1 min-h-0">{children}</div>
    </div>
  );
}

const MEDIA_PREVIEW: Record<string, { icon: typeof Camera; label: string }> = {
  image: { icon: Camera, label: "Foto" },
  video: { icon: Video, label: "Vídeo" },
  audio: { icon: Mic, label: "Áudio" },
  document: { icon: FileText, label: "Documento" },
};

// Prévia da última mensagem, como na lista do WhatsApp: "Você: ..." quando
// fomos nós, e ícone + "Foto"/"Áudio" quando é anexo sem texto.
function Preview({ message }: { message: ListMessage | undefined }) {
  if (!message) return <span className="italic">Sem mensagens</span>;
  const media = message.mediaType ? MEDIA_PREVIEW[message.mediaType] : undefined;
  const Icon = media?.icon;
  return (
    <>
      {message.direction === "OUT" && "Você: "}
      {Icon && <Icon className="inline w-3.5 h-3.5 -mt-0.5 mr-1" />}
      {message.body || media?.label || ""}
    </>
  );
}

// Desde quando o cliente espera: a mensagem dele mais antiga depois da nossa
// última resposta (dentro das que a lista carrega).
function waitingSince(messages: ListMessage[]): Date | null {
  let since: Date | null = null;
  for (const m of messages) {
    if (m.direction !== "IN") break;
    since = m.createdAt;
  }
  return since;
}

// Uma linha da lista, no formato do WhatsApp: foto (inicial), nome e hora da
// última mensagem em cima, prévia embaixo. Sem resposta: nome em negrito, hora
// verde e o tempo de espera no lugar do contador de não lidas.
function QueueRow({
  conversation: c,
  active,
  userId,
  now,
}: {
  conversation: QueueConversation;
  active: boolean;
  userId: string;
  now: Date;
}) {
  const last = c.messages[0];
  // Agradecimento no fim ("obrigado", "valeu", 👍) não precisa de resposta:
  // não pinta de vermelho. "ok"/"certo" sim — pode ser resposta a uma pergunta.
  const unanswered =
    c.status !== "RESOLVED" && last?.direction === "IN" && closingKind(last.body, last.mediaType) !== "thanks";
  const since = unanswered ? waitingSince(c.messages) : null;
  const bar = c.status === "RESOLVED" ? STATE_BAR.resolved : unanswered ? STATE_BAR.unanswered : STATE_BAR.inProgress;
  const details = [
    whatsappLineLabel(c.line),
    c.sector && sectorLabel(c.sector),
    // Com você já é a coluna; aqui só quando é de um colega.
    c.assignedTo && c.assignedTo.id !== userId && `Com ${c.assignedTo.name}`,
    c.rating && `${c.rating.score}★`,
  ].filter(Boolean);

  return (
    <Link
      href={`/admin/whatsapp/suporte?c=${c.id}`}
      className={`relative flex items-center gap-3 pl-4 pr-3 py-2.5 transition-colors ${
        active ? "bg-wa-active" : "hover:bg-wa-panel"
      }`}
    >
      <span className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full ${bar}`} />
      <div className="w-11 h-11 rounded-full bg-[#6a7175]/40 flex items-center justify-center text-base font-medium text-wa-text shrink-0">
        {c.customer.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1 border-b border-wa-border/70 pb-2.5 -mb-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-[15px] text-wa-text truncate ${unanswered ? "font-semibold" : "font-normal"}`}>
            {c.customer.name}
          </span>
          <span className={`text-xs shrink-0 ${unanswered ? "text-wa-green font-medium" : "text-wa-muted"}`}>
            {formatListTime(last?.createdAt ?? c.lastMessageAt, now)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className={`text-[13px] truncate ${unanswered ? "text-wa-text" : "text-wa-muted"}`}>
            <Preview message={last} />
          </span>
          {since && (
            <span
              className="shrink-0 rounded-full bg-wa-green px-1.5 text-[11px] font-semibold leading-[18px] text-wa-bg"
              title="Tempo esperando resposta"
            >
              {formatWaitingTime(since, now)}
            </span>
          )}
        </div>
        <div className="text-[11px] text-wa-muted truncate mt-0.5">
          {formatPhone(c.customer.phone)} · {details.join(" · ")}
        </div>
      </div>
    </Link>
  );
}
