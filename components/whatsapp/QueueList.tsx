import Link from "next/link";
import { Camera, Video, Mic, FileText } from "lucide-react";
import { formatListTime, formatPhone, formatWaitingTime } from "@/lib/format";
import { whatsappLineLabel } from "@/lib/whatsapp/lines";
import { sectorLabel } from "@/lib/whatsapp/sectors";
import { needsReply } from "@/lib/whatsapp/closing";
import { ContactAvatar } from "./ContactAvatar";
import { OVERDUE_MS, QUEUE_SECTION_EMPTY, QUEUE_SECTION_LABELS, type QueueSection } from "@/lib/whatsapp/queue";

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

// Legenda das cores acima (a página mostra junto do título). Finalizada não
// entra: as finalizadas saíram da fila e ficam no filtro (Situação: Finalizados).
export function QueueLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className={`w-1 h-3 rounded-full ${STATE_BAR.unanswered}`} /> Sem resposta
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`w-1 h-3 rounded-full ${STATE_BAR.inProgress}`} /> Respondida
      </span>
    </div>
  );
}

type ListMessage = { direction: string; body: string; mediaType: string | null; createdAt: Date };

export type QueueConversation = {
  id: string;
  number: number;
  status: string;
  line: string;
  sector: string | null;
  lastMessageAt: Date;
  customer: { id: string; name: string; phone: string };
  rating: { score: number } | null;
  assignedTo: { id: string; name: string } | null;
  // Últimas mensagens (sem as apagadas), da mais nova pra mais velha: a
  // primeira dá a prévia e se o cliente falou por último (IN = sem resposta);
  // a sequência de IN no começo dá desde quando ele espera.
  messages: ListMessage[];
  // Desde quando espera resposta, calculado no banco (withWaitingSince) — sem
  // ele, usa a sequência de IN das mensagens carregadas.
  waitingSince?: Date | null;
};

type Sections<T> = { section: QueueSection; conversations: T[] }[];

// A fila numa coluna só, embaixo do filtro (que fica no topo da mesma coluna):
// "Em espera" (ninguém assumiu) em cima, depois "Com você" e, na visão Equipe
// de CEO/Gerente, "Com a equipe". O título de cada parte fica preso no topo
// enquanto rola; dentro dela, a ordem escolhida no filtro.
// overdue + showOverdue: aba "Sem resposta +4h" — uma lista só, e cada linha
// diz de quem é a conversa.
export function QueueList<T extends QueueConversation>({
  sections,
  activeId,
  userId,
  overdue = [],
  showOverdue = false,
}: {
  sections: Sections<T>;
  activeId: string | undefined;
  userId: string;
  overdue?: T[];
  showOverdue?: boolean;
}) {
  const now = new Date();
  const row = (c: T, showOwner = false) => (
    <QueueRow key={c.id} conversation={c} active={c.id === activeId} userId={userId} now={now} showOwner={showOwner} />
  );

  return (
    <div className="overflow-y-auto flex-1 min-h-0 rounded-b-2xl">
      {showOverdue ? (
        overdue.length > 0 ? (
          overdue.map((c) => row(c, true))
        ) : (
          <p className="px-4 py-8 text-center text-xs text-wa-muted">
            Nenhum cliente esperando resposta há mais de 4 horas.
          </p>
        )
      ) : (
        sections.map(({ section, conversations: rows }) => {
          const empty = QUEUE_SECTION_EMPTY[section];
          if (rows.length === 0 && !empty) return null;
          return (
            <section key={section}>
              <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-wa-border bg-wa-panel px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-wa-green">
                <span>{QUEUE_SECTION_LABELS[section]}</span>
                <span
                  className={`min-w-[20px] rounded-full px-1.5 text-center leading-[18px] ${
                    section === "waiting" && rows.length > 0 ? "bg-wa-green text-wa-bg" : "text-wa-muted"
                  }`}
                >
                  {rows.length}
                </span>
              </div>
              {rows.length > 0 ? (
                rows.map((c) => row(c))
              ) : (
                <p className="px-4 py-3 text-xs text-wa-muted">{empty}</p>
              )}
            </section>
          );
        })
      )}
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
// showOwner: na aba +4h a lista não diz de quem é a conversa — a linha diz
// (Com você / Em espera / Com colega).
function QueueRow({
  conversation: c,
  active,
  userId,
  now,
  showOwner = false,
}: {
  conversation: QueueConversation;
  active: boolean;
  userId: string;
  now: Date;
  showOwner?: boolean;
}) {
  const last = c.messages[0];
  // Agradecimento no fim ("obrigado", "valeu", 👍) não precisa de resposta:
  // não pinta de vermelho. "ok"/"certo" sim — pode ser resposta a uma pergunta.
  const unanswered = c.status !== "RESOLVED" && needsReply(last);
  const since = unanswered ? (c.waitingSince ?? waitingSince(c.messages)) : null;
  const overdue = since !== null && now.getTime() - since.getTime() >= OVERDUE_MS;
  const bar = c.status === "RESOLVED" ? STATE_BAR.resolved : unanswered ? STATE_BAR.unanswered : STATE_BAR.inProgress;
  const details = [
    whatsappLineLabel(c.line),
    c.sector && sectorLabel(c.sector),
    // Com você já é a parte da lista; aqui só quando é de um colega (ou na aba +4h).
    showOwner
      ? c.assignedTo
        ? c.assignedTo.id === userId
          ? "Com você"
          : `Com ${c.assignedTo.name}`
        : "Em espera"
      : c.assignedTo && c.assignedTo.id !== userId && `Com ${c.assignedTo.name}`,
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
      <ContactAvatar customerId={c.customer.id} name={c.customer.name} className="w-11 h-11 text-base" />
      <div className="min-w-0 flex-1 border-b border-wa-border/70 pb-2.5 -mb-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-[15px] text-wa-text truncate ${unanswered ? "font-semibold" : "font-normal"}`}>
            {c.customer.name} <span className="text-xs font-normal text-wa-muted">#{c.number}</span>
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
              className={`shrink-0 rounded-full px-1.5 text-[11px] font-semibold leading-[18px] ${
                overdue ? "bg-[rgb(244,63,94)] text-white" : "bg-wa-green text-wa-bg"
              }`}
              title={overdue ? "Esperando resposta há mais de 4 horas" : "Tempo esperando resposta"}
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
