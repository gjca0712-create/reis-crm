import type { ReactNode } from "react";
import { ArrowRightLeft, Ban } from "lucide-react";
import type { ConversationTransfer, Message } from "@prisma/client";
import { formatDayLabel, formatTime } from "@/lib/format";
import { sectorLabel } from "@/lib/whatsapp/sectors";
import { ChatImage } from "./ChatImage";

// Balões da conversa (mensagens + transferências na ordem em que aconteceram),
// com separador de dia — usado no WhatsApp Suporte e, só leitura, em Mensagens
// antigas.

// Fundo da conversa: pontinhos bem fracos, no lugar do papel de parede do WhatsApp.
export const CHAT_WALLPAPER = "bg-[radial-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:18px_18px]";

// Anexo de uma mensagem apagada: a mídia sai da conversa, fica só a menção.
const MEDIA_LABELS: Record<string, string> = { image: "foto", video: "vídeo", audio: "áudio", document: "documento" };

export type TimelineMessage = Message & { sender: { name: string } | null };
export type TimelineTransfer = ConversationTransfer & { byUser: { name: string } };

export function ChatTimeline({
  messages,
  transfers,
  now,
  actionsFor,
}: {
  messages: TimelineMessage[];
  transfers: TimelineTransfer[];
  now: Date;
  // Editar/apagar de uma mensagem enviada (só no Suporte). null/ausente = só o
  // nome de quem mandou embaixo do balão.
  actionsFor?: (m: TimelineMessage, senderLabel: string) => ReactNode;
}) {
  const timeline = [
    ...messages.map((m) => ({ kind: "message" as const, at: m.createdAt, m })),
    ...transfers.map((t) => ({ kind: "transfer" as const, at: t.createdAt, t })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <div className="space-y-1.5">
      {timeline.map((item, i) => {
        // Separador de dia ("Hoje", "Ontem", data) quando o dia muda.
        const dayLabel = formatDayLabel(item.at, now);
        const showDay = i === 0 || formatDayLabel(timeline[i - 1].at, now) !== dayLabel;
        const daySeparator = showDay && (
          <div className="flex justify-center py-1.5">
            <span className="rounded-lg bg-wa-note px-3 py-1 text-[12.5px] text-wa-muted shadow-sm">{dayLabel}</span>
          </div>
        );

        if (item.kind === "transfer") {
          const t = item.t;
          return (
            <div key={`t-${t.id}`}>
              {daySeparator}
              <div className="flex justify-center py-1">
                <div className="max-w-[85%] rounded-lg bg-wa-note px-3 py-2 text-center text-[12.5px] shadow-sm">
                  <p className="flex items-center justify-center gap-1.5 text-[#ffd279]">
                    <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
                    {t.byUser.name} transferiu de {sectorLabel(t.fromSector)} para {sectorLabel(t.toSector)} ·{" "}
                    {formatTime(t.createdAt)}
                  </p>
                  <p className="mt-1 text-wa-text whitespace-pre-wrap">Motivo: {t.reason}</p>
                </div>
              </div>
            </div>
          );
        }

        const m = item.m;
        const out = m.direction === "OUT";
        const senderLabel = m.sender ? m.sender.name : "Respondido pelo celular";

        // Apagada pra todos (pelo CRM, pelo celular ou pelo cliente): igual o
        // WhatsApp mostra o aviso no lugar, mas a equipe ainda enxerga o que
        // era, riscado — é histórico do atendimento.
        if (m.deletedAt) {
          const who = !out ? "pelo cliente" : m.deletedByName ? `por ${m.deletedByName}` : "pelo celular";
          const mediaLabel = m.mediaType ? (MEDIA_LABELS[m.mediaType] ?? "anexo") : null;
          // Legenda de áudio apagada antes (body vazio): o texto ficou em originalBody.
          const deletedText = m.body || m.originalBody;
          return (
            <div key={m.id}>
              {daySeparator}
              <div className={`flex flex-col ${out ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[75%] rounded-lg px-2.5 py-1.5 text-sm text-wa-muted shadow-sm ${
                    out ? "bg-wa-out/60 rounded-tr-none" : "bg-wa-panel/70 rounded-tl-none"
                  }`}
                >
                  <p className="flex items-center gap-1.5 italic">
                    <Ban className="w-3.5 h-3.5 shrink-0" /> Mensagem apagada {who}
                  </p>
                  {(deletedText || mediaLabel) && (
                    <p className="mt-1 text-xs line-through opacity-70 whitespace-pre-wrap">
                      {mediaLabel && `[${mediaLabel}${m.mediaFileName ? `: ${m.mediaFileName}` : ""}] `}
                      {deletedText}
                    </p>
                  )}
                  <p className="text-[11px] mt-1 text-right">
                    {formatTime(m.createdAt)} · apagada {formatDayLabel(m.deletedAt, now).toLowerCase()} às{" "}
                    {formatTime(m.deletedAt)}
                  </p>
                </div>
                {out && <span className="text-[10px] text-wa-muted mt-0.5 mr-1">{senderLabel}</span>}
              </div>
            </div>
          );
        }

        const actions = out ? actionsFor?.(m, senderLabel) : null;
        // Hora dentro do balão, no canto de baixo, igual o WhatsApp: a cópia
        // invisível reserva o espaço no fim do texto.
        const meta = `${m.editedAt ? "editada · " : ""}${formatTime(m.createdAt)}`;

        return (
          <div key={m.id}>
            {daySeparator}
            <div className={`group flex flex-col ${out ? "items-end" : "items-start"}`}>
              <div
                className={`relative max-w-[75%] rounded-lg px-2.5 pt-1.5 pb-2 text-[14.2px] leading-[19px] text-wa-text shadow-sm ${
                  out ? "bg-wa-out rounded-tr-none" : "bg-wa-panel rounded-tl-none"
                }`}
                title={m.originalBody ? `Antes da edição: ${m.originalBody}` : undefined}
              >
                {m.mediaUrl && m.mediaType === "image" && (
                  <ChatImage
                    src={`/api/whatsapp/media/${m.mediaUrl}`}
                    alt={m.mediaFileName ?? "Imagem"}
                    fileName={m.mediaFileName}
                  />
                )}
                {m.mediaUrl && m.mediaType === "video" && (
                  <video src={`/api/whatsapp/media/${m.mediaUrl}`} controls className="rounded-lg max-w-full max-h-64 mb-1.5" />
                )}
                {m.mediaUrl && m.mediaType === "audio" && (
                  <audio src={`/api/whatsapp/media/${m.mediaUrl}`} controls className="w-60 max-w-full mb-1.5" />
                )}
                {m.mediaUrl && m.mediaType === "document" && (
                  <a
                    href={`/api/whatsapp/media/${m.mediaUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 underline text-xs mb-1.5 opacity-90"
                  >
                    📎 {m.mediaFileName ?? "Abrir arquivo"}
                  </a>
                )}
                {m.body && <span className="whitespace-pre-wrap break-words">{m.body}</span>}
                <span className="invisible inline-block pl-3 text-[11px]" aria-hidden>
                  {meta}
                </span>
                <span
                  className={`absolute bottom-1 right-2 text-[11px] leading-none ${out ? "text-white/60" : "text-wa-muted"}`}
                >
                  {meta}
                </span>
              </div>
              {actions ?? (out && <span className="text-[10px] text-wa-muted mt-0.5 mr-1">{senderLabel}</span>)}
            </div>
          </div>
        );
      })}
      {timeline.length === 0 && <p className="text-center text-sm text-wa-muted py-6">Nenhuma mensagem ainda.</p>}
    </div>
  );
}
