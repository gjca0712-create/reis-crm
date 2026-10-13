import Link from "next/link";
import { Camera, ChevronLeft, ChevronRight, CornerUpLeft, FileText, MessageCircle, Mic, User, Video } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { whatsappLineLabel } from "@/lib/whatsapp/lines";
import { sectorLabel } from "@/lib/whatsapp/sectors";
import { needsReply } from "@/lib/whatsapp/closing";
import { formatShortAgo } from "@/lib/whatsapp/filters";
import { ContactAvatar } from "./ContactAvatar";

export type FinishedConversation = {
  id: string;
  number: number;
  line: string;
  sector: string | null;
  createdAt: Date;
  lastMessageAt: Date;
  customer: { id: string; name: string; phone: string };
  assignedTo: { name: string } | null;
  resolvedBy: { name: string } | null;
  // Só a última que ainda vale (apagada não conta) — dá a prévia.
  messages: { direction: string; body: string; mediaType: string | null; sender: { name: string } | null }[];
};

const MEDIA_PREVIEW: Record<string, { icon: typeof Camera; label: string }> = {
  image: { icon: Camera, label: "Foto" },
  video: { icon: Video, label: "Vídeo" },
  audio: { icon: Mic, label: "Áudio" },
  document: { icon: FileText, label: "Documento" },
};

const href = (page: number, c?: string) => {
  const s = new URLSearchParams();
  if (page > 1) s.set("p", String(page));
  if (c) s.set("c", c);
  const query = s.toString();
  return `/admin/whatsapp/suporte${query ? `?${query}` : ""}`;
};

// Situação "Finalizados" do filtro do Suporte: os atendimentos já resolvidos
// (as conversas antigas), no formato do painel que a loja usava — linha e setor
// em cima, quem atendeu à direita, nome com o número do atendimento, "aberto há
// • última atividade há" e a prévia da última mensagem. 30 por página.
export function FinishedList({
  conversations,
  activeId,
  page,
  pages,
  total,
  now,
}: {
  conversations: FinishedConversation[];
  activeId: string | undefined;
  page: number;
  pages: number;
  total: number;
  now: Date;
}) {
  return (
    <div className="rounded-2xl border border-wa-border bg-wa-list overflow-hidden flex flex-col min-h-0 flex-1 max-h-[70vh] lg:max-h-none">
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-wa-panel text-xs text-wa-muted">
        <span>Atendimentos finalizados</span>
        <span className="tabular-nums">{total}</span>
      </div>
      <div className="overflow-y-auto flex-1 min-h-0">
        {conversations.map((c) => {
          const last = c.messages[0];
          // Finalizado com o cliente falando por último (e não era só um
          // "obrigado"): ficou sem resposta — faixa vermelha, igual à fila.
          const unanswered = needsReply(last);
          const agent = c.resolvedBy?.name ?? c.assignedTo?.name;
          const media = last?.mediaType ? MEDIA_PREVIEW[last.mediaType] : undefined;
          const MediaIcon = media?.icon;
          const previewText = last?.body || media?.label;
          return (
            <Link
              key={c.id}
              href={href(page, c.id)}
              scroll={false}
              className={`relative flex gap-3 pl-4 pr-3 py-3 border-b border-wa-border/70 transition-colors ${
                c.id === activeId ? "bg-wa-active" : "hover:bg-wa-panel"
              }`}
            >
              {unanswered && (
                <span
                  className="absolute left-0 top-0 bottom-0 w-1 bg-[rgb(244,63,94)]"
                  title="Finalizado com o cliente sem resposta"
                />
              )}
              <span className="relative self-center shrink-0">
                <ContactAvatar customerId={c.customer.id} name={c.customer.name} className="w-12 h-12 text-base" />
                <span className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-wa-green ring-2 ring-wa-list flex items-center justify-center">
                  <MessageCircle className="w-2.5 h-2.5 text-wa-bg" strokeWidth={3} />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-[12px] text-wa-muted">
                  <span className="flex items-center gap-1 min-w-0">
                    <MessageCircle className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {whatsappLineLabel(c.line)}
                      {c.sector ? ` · ${sectorLabel(c.sector)}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0 max-w-[50%]">
                    <User className="w-3 h-3 shrink-0" />
                    <span className="truncate">{agent ?? "Sem atendente"}</span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-0.5">
                  <span className="text-[15px] text-wa-text truncate">
                    {c.customer.name} <span className="text-[13px] font-semibold">#{c.number}</span>
                  </span>
                  <span
                    className="text-[11px] text-wa-muted shrink-0 tabular-nums"
                    title={`Aberto em ${formatDateTime(c.createdAt)} · última atividade em ${formatDateTime(c.lastMessageAt)}`}
                  >
                    {formatShortAgo(c.createdAt, now)} • {formatShortAgo(c.lastMessageAt, now)}
                  </span>
                </div>
                <p className="text-[13.5px] text-wa-muted truncate mt-0.5">
                  {last?.direction === "OUT" && (
                    <>
                      <CornerUpLeft className="inline w-3.5 h-3.5 -mt-0.5 mr-0.5" />
                      {last.sender?.name ?? "Celular"}:{" "}
                    </>
                  )}
                  {MediaIcon && <MediaIcon className="inline w-3.5 h-3.5 -mt-0.5 mr-1" />}
                  {previewText || <span className="italic">Nenhum conteúdo disponível</span>}
                </p>
              </div>
            </Link>
          );
        })}
        {conversations.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-wa-muted">Nenhum atendimento finalizado com esses filtros.</p>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-wa-border bg-wa-panel text-xs text-wa-muted">
          {page > 1 ? (
            <Link href={href(page - 1)} className="inline-flex items-center gap-1 hover:text-wa-text">
              <ChevronLeft className="w-4 h-4" /> Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="tabular-nums">
            Página {page} de {pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} className="inline-flex items-center gap-1 hover:text-wa-text">
              Próxima <ChevronRight className="w-4 h-4" />
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
