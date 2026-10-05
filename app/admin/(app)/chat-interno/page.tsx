import Link from "next/link";
import { Users } from "lucide-react";
import { requireSession } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDayLabel, formatListTime, formatTime } from "@/lib/format";
import {
  GENERAL_CHANNEL,
  listTeamChannels,
  markTeamChannelRead,
  resolveTeamChannel,
  teamChannelMessages,
} from "@/lib/team-chat";
import { AutoRefresh } from "@/components/whatsapp/AutoRefresh";
import { ReplyForm } from "@/components/whatsapp/ReplyForm";
import { sendTeamChatMessage } from "./actions";

export const metadata = { title: "Chat interno" };

// Fundo da conversa: o mesmo do WhatsApp Suporte.
const CHAT_WALLPAPER = "bg-[radial-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:18px_18px]";

// Cor do nome de quem escreveu no Geral (como nos grupos do WhatsApp), fixa
// por pessoa.
const NAME_COLORS = ["text-[#53bdeb]", "text-[#ffd279]", "text-[#ff8a8c]", "text-[#a5b337]", "text-[#d88deb]", "text-[#7ae3c3]"];
function nameColor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

export default async function ChatInternoPage({ searchParams }: { searchParams: Promise<{ c?: string; erro?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  // Destino inválido (link velho, o próprio usuário): cai no Geral.
  const opened = (await resolveTeamChannel(session.userId, params.c)) ?? { channel: GENERAL_CHANNEL, other: null };
  const target = opened.other?.id ?? GENERAL_CHANNEL;

  // Abrir (e cada atualização automática enquanto está aberta) conta como lido.
  await markTeamChannelRead(session.userId, opened.channel);
  const [channels, messages] = await Promise.all([
    listTeamChannels(session.userId),
    teamChannelMessages(opened.channel),
  ]);
  const now = new Date();
  const isGeneral = opened.channel === GENERAL_CHANNEL;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Chat interno</h1>
        <p className="text-sm text-ink-muted mt-0.5">Conversa da equipe: canal geral e mensagens privadas</p>
      </div>

      {params.erro && (
        <div className="rounded-lg border border-status-critical/30 bg-status-critical/10 px-4 py-3 text-sm text-status-critical">
          {params.erro}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 lg:h-[calc(100vh-220px)] lg:min-h-[480px]">
        <div className="rounded-2xl border border-wa-border bg-wa-list overflow-hidden flex flex-col min-h-0 max-h-72 lg:max-h-none">
          <div className="px-4 py-3 bg-wa-panel text-[15px] font-medium text-wa-text">Conversas</div>
          <div className="overflow-y-auto flex-1 min-h-0">
            {channels.map((ch) => {
              const active = ch.channel === opened.channel;
              const preview = ch.last
                ? `${ch.last.senderId === session.userId ? "Você" : ch.target === GENERAL_CHANNEL ? ch.last.senderName.split(" ")[0] : ""}${
                    ch.last.senderId === session.userId || ch.target === GENERAL_CHANNEL ? ": " : ""
                  }${ch.last.body}`
                : ch.role
                  ? ROLE_LABELS[ch.role] ?? ch.role
                  : "Toda a equipe";
              return (
                <Link
                  key={ch.channel}
                  href={ch.target === GENERAL_CHANNEL ? "/admin/chat-interno" : `/admin/chat-interno?c=${ch.target}`}
                  className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                    active ? "bg-wa-active" : "hover:bg-wa-panel"
                  }`}
                >
                  <div className="w-11 h-11 rounded-full bg-[#6a7175]/40 flex items-center justify-center text-base font-medium text-wa-text shrink-0">
                    {ch.target === GENERAL_CHANNEL ? <Users className="w-5 h-5" /> : ch.label.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-[15px] text-wa-text truncate ${ch.unread ? "font-semibold" : ""}`}>
                        {ch.label}
                      </span>
                      {ch.last && (
                        <span className={`text-xs shrink-0 ${ch.unread ? "text-wa-green font-medium" : "text-wa-muted"}`}>
                          {formatListTime(ch.last.createdAt, now)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className={`text-[13px] truncate ${ch.unread ? "text-wa-text" : "text-wa-muted"}`}>
                        {preview}
                      </span>
                      {ch.unread > 0 && (
                        <span className="shrink-0 min-w-[20px] rounded-full bg-wa-green px-1.5 text-center text-[11px] font-semibold leading-5 text-wa-bg">
                          {ch.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-wa-border bg-wa-bg overflow-hidden flex flex-col min-h-0 h-[70vh] lg:h-auto">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-wa-panel">
            <div className="w-10 h-10 rounded-full bg-[#6a7175]/40 flex items-center justify-center text-base font-medium text-wa-text shrink-0">
              {isGeneral ? <Users className="w-5 h-5" /> : opened.other!.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-medium text-wa-text truncate">
                {isGeneral ? "Geral (toda a equipe)" : opened.other!.name}
              </div>
              <div className="text-xs text-wa-muted">
                {isGeneral
                  ? "Todo mundo da equipe vê"
                  : `${ROLE_LABELS[opened.other!.role] ?? opened.other!.role} · só vocês dois veem`}
              </div>
            </div>
          </div>

          {/* flex-col-reverse: a rolagem já começa no fim (mensagem mais nova),
              e a atualização automática não pula pro topo. */}
          <div className={`flex-1 overflow-y-auto flex flex-col-reverse px-4 sm:px-[6%] py-3 ${CHAT_WALLPAPER}`}>
            <div className="space-y-1.5">
              {messages.map((m, i) => {
                const mine = m.sender.id === session.userId;
                const dayLabel = formatDayLabel(m.createdAt, now);
                const showDay = i === 0 || formatDayLabel(messages[i - 1].createdAt, now) !== dayLabel;
                // Nome em cima do balão só no Geral, e só na primeira de uma sequência da mesma pessoa.
                const showName = isGeneral && !mine && (showDay || messages[i - 1]?.sender.id !== m.sender.id);
                return (
                  <div key={m.id}>
                    {showDay && (
                      <div className="flex justify-center py-1.5">
                        <span className="rounded-lg bg-wa-note px-3 py-1 text-[12.5px] text-wa-muted shadow-sm">
                          {dayLabel}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`relative max-w-[75%] rounded-lg px-2.5 pt-1.5 pb-2 text-[14.2px] leading-[19px] text-wa-text shadow-sm ${
                          mine ? "bg-wa-out rounded-tr-none" : "bg-wa-panel rounded-tl-none"
                        }`}
                      >
                        {showName && (
                          <div className={`text-[12.5px] font-medium mb-0.5 ${nameColor(m.sender.id)}`}>{m.sender.name}</div>
                        )}
                        <span className="whitespace-pre-wrap break-words">{m.body}</span>
                        <span className="invisible inline-block pl-3 text-[11px]" aria-hidden>
                          {formatTime(m.createdAt)}
                        </span>
                        <span
                          className={`absolute bottom-1 right-2 text-[11px] leading-none ${mine ? "text-white/60" : "text-wa-muted"}`}
                        >
                          {formatTime(m.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && (
                <p className="text-center text-sm text-wa-muted py-6">
                  {isGeneral ? "Nenhuma mensagem no Geral ainda." : "Nenhuma mensagem ainda. Mande a primeira."}
                </p>
              )}
            </div>
          </div>

          <ReplyForm
            // Limpa a caixa só quando a própria pessoa manda (a última dela
            // muda) — mensagem nova de colega não apaga o que está digitando.
            key={`${opened.channel}-${messages.findLast((m) => m.sender.id === session.userId)?.id ?? ""}`}
            action={sendTeamChatMessage.bind(null, target)}
            placeholder={isGeneral ? "Mensagem para toda a equipe" : `Mensagem para ${opened.other!.name.split(" ")[0]}`}
            allowAttachments={false}
          />
        </div>
      </div>

      {/* Mensagem nova de colega aparece sozinha, sem F5. */}
      <AutoRefresh intervalMs={5000} />
    </div>
  );
}
