import Link from "next/link";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  ExternalLink,
  FileText,
  MessageCircle,
  MessagesSquare,
  Mic,
  User,
  Video,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionFeatures, requireFeature } from "@/lib/session";
import { canAccess } from "@/lib/permissions";
import { formatDate, formatDateTime, formatPhone } from "@/lib/format";
import { WHATSAPP_LINES, whatsappLineLabel } from "@/lib/whatsapp/lines";
import { SECTORS, sectorLabel } from "@/lib/whatsapp/sectors";
import { needsReply } from "@/lib/whatsapp/closing";
import {
  NO_AGENT,
  NO_SECTOR,
  archiveOrderBy,
  archiveQuery,
  archiveWhere,
  formatShortAgo,
  parseArchiveFilters,
  type ArchiveParams,
} from "@/lib/whatsapp/archive";
import { Badge } from "@/components/ui/Badge";
import { ContactAvatar } from "@/components/whatsapp/ContactAvatar";
import { ArchiveFilters } from "@/components/whatsapp/ArchiveFilters";
import { ChatTimeline, CHAT_WALLPAPER } from "@/components/whatsapp/ChatTimeline";

// Mensagens antigas: histórico dos atendimentos — por padrão os finalizados
// (Resolvido), que saem da fila do Suporte. Só CEO e Gerente (feature
// whatsapp_gestao), só leitura. Cliente que volta a escrever depois abre um
// atendimento novo no Suporte; o finalizado continua aqui.

const PAGE_SIZE = 30;

const MEDIA_PREVIEW: Record<string, { icon: typeof Camera; label: string }> = {
  image: { icon: Camera, label: "Foto" },
  video: { icon: Video, label: "Vídeo" },
  audio: { icon: Mic, label: "Áudio" },
  document: { icon: FileText, label: "Documento" },
};

export default async function MensagensAntigasPage({ searchParams }: { searchParams: Promise<ArchiveParams> }) {
  const session = await requireFeature("whatsapp_gestao");
  const features = await getSessionFeatures(session);
  const params = await searchParams;
  const filters = parseArchiveFilters(params);
  const page = Math.max(1, Math.floor(Number(params.p)) || 1);
  const where = archiveWhere(filters);

  const [total, conversations, agentUsers] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: archiveOrderBy(filters.order),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        assignedTo: { select: { name: true } },
        resolvedBy: { select: { name: true } },
        // Prévia da lista: a última mensagem que ainda vale (apagada não conta).
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { direction: true, body: true, mediaType: true, sender: { select: { name: true } } },
        },
      },
    }),
    // Pro filtro de atendentes: quem já pegou ou finalizou alguma conversa.
    prisma.user.findMany({
      where: { OR: [{ assignedConversations: { some: {} } }, { resolvedConversations: { some: {} } }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Igual ao painel de atendimentos: nada aberto até clicar numa conversa.
  const active = params.c
    ? await prisma.conversation.findUnique({
        where: { id: params.c },
        include: {
          customer: true,
          rating: true,
          assignedTo: { select: { name: true } },
          resolvedBy: { select: { name: true } },
          messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { name: true } } } },
          transfers: { orderBy: { createdAt: "asc" }, include: { byUser: { select: { name: true } } } },
        },
      })
    : null;

  const now = new Date();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Mensagens antigas</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Histórico dos atendimentos do WhatsApp Suporte · {total} {total === 1 ? "conversa" : "conversas"}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[400px_minmax(0,1fr)] gap-4 lg:h-[calc(100vh-170px)] lg:min-h-[520px]">
        <div className="rounded-2xl border border-wa-border bg-wa-list flex flex-col min-h-0 max-h-[70vh] lg:max-h-none">
          <ArchiveFilters
            filters={filters}
            sectors={[...SECTORS.map((s) => ({ id: s.id as string, label: s.label })), { id: NO_SECTOR, label: "Geral (sem setor)" }]}
            agents={[...agentUsers.map((u) => ({ id: u.id, label: u.name })), { id: NO_AGENT, label: "Sem atendente" }]}
            lines={WHATSAPP_LINES.map((l) => ({ id: l.id as string, label: l.label }))}
          />

          <div className="overflow-y-auto flex-1 min-h-0 rounded-b-2xl">
            {conversations.map((c) => {
              const last = c.messages[0];
              // Finalizado com o cliente falando por último (e não era só um
              // "obrigado"): ficou sem resposta — faixa vermelha, igual ao Suporte.
              const unanswered = needsReply(last);
              const agent = c.assignedTo?.name ?? c.resolvedBy?.name;
              const media = last?.mediaType ? MEDIA_PREVIEW[last.mediaType] : undefined;
              const MediaIcon = media?.icon;
              const previewText = last?.body || media?.label;
              return (
                <Link
                  key={c.id}
                  href={archiveQuery(filters, { p: page, c: c.id })}
                  scroll={false}
                  className={`relative flex gap-3 pl-4 pr-3 py-3 border-b border-wa-border/70 transition-colors ${
                    c.id === active?.id ? "bg-wa-active" : "hover:bg-wa-panel"
                  }`}
                >
                  {unanswered && (
                    <span
                      className="absolute left-0 top-0 bottom-0 w-1 bg-[rgb(244,63,94)]"
                      title={c.status === "RESOLVED" ? "Finalizado com o cliente sem resposta" : "Cliente esperando resposta"}
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
              <p className="px-4 py-10 text-center text-sm text-wa-muted">Nenhuma conversa com esses filtros.</p>
            )}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-wa-border bg-wa-panel text-xs text-wa-muted rounded-b-2xl">
              {page > 1 ? (
                <Link href={archiveQuery(filters, { p: page - 1 })} className="inline-flex items-center gap-1 hover:text-wa-text">
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="tabular-nums">
                Página {page} de {pages}
              </span>
              {page < pages ? (
                <Link href={archiveQuery(filters, { p: page + 1 })} className="inline-flex items-center gap-1 hover:text-wa-text">
                  Próxima <ChevronRight className="w-4 h-4" />
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-wa-border bg-wa-bg overflow-hidden flex flex-col min-h-0 h-[75vh] lg:h-auto">
          {active ? (
            <>
              <div className="flex items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 bg-wa-panel flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <ContactAvatar customerId={active.customer.id} name={active.customer.name} className="w-10 h-10" />
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium text-wa-text truncate">
                      {active.customer.name} <span className="text-[13px] text-wa-muted">#{active.number}</span>
                    </p>
                    <p className="text-xs text-wa-muted truncate">
                      {[
                        formatPhone(active.customer.phone),
                        active.customer.bairro,
                        whatsappLineLabel(active.line),
                        active.sector && sectorLabel(active.sector),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
                  {active.rating && <Badge status="good">{active.rating.score}★ avaliação</Badge>}
                  {active.status === "RESOLVED" ? (
                    <Badge status="neutral">
                      Finalizado{active.resolvedBy ? ` por ${active.resolvedBy.name}` : ""}
                      {active.resolvedAt ? ` · ${formatDateTime(active.resolvedAt)}` : ""}
                    </Badge>
                  ) : (
                    <Badge status="good">Em aberto{active.assignedTo ? ` · com ${active.assignedTo.name}` : " · em espera"}</Badge>
                  )}
                  {canAccess(features, "whatsapp_suporte") && (
                    <Link
                      href={`/admin/whatsapp/suporte?c=${active.id}`}
                      className="inline-flex items-center gap-1.5 text-xs text-wa-muted hover:text-wa-text"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Abrir no Suporte
                    </Link>
                  )}
                </div>
              </div>

              <div className={`flex-1 overflow-y-auto flex flex-col-reverse px-4 sm:px-[6%] py-3 ${CHAT_WALLPAPER}`}>
                <ChatTimeline messages={active.messages} transfers={active.transfers} now={now} />
              </div>

              <div className="px-4 py-3 bg-wa-panel text-xs text-wa-muted text-center">
                Atendimento aberto em {formatDate(active.createdAt)} ·{" "}
                {active.status === "RESOLVED"
                  ? "só leitura — se o cliente escrever de novo, abre um atendimento novo no Suporte."
                  : "ainda em aberto — responda pelo Suporte."}
              </div>
            </>
          ) : (
            <div className={`flex-1 flex items-center justify-center p-6 text-center ${CHAT_WALLPAPER}`}>
              <div>
                <span className="mx-auto mb-4 w-24 h-24 rounded-full bg-wa-panel flex items-center justify-center">
                  <MessagesSquare className="w-10 h-10 text-wa-muted" />
                </span>
                <p className="text-base font-medium text-wa-text">Nenhuma conversa aberta!</p>
                <p className="text-sm text-wa-muted mt-1">Selecione uma conversa da lista para ver o histórico do atendimento.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
