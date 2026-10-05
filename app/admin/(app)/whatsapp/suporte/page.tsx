import Link from "next/link";
import { cookies } from "next/headers";
import { MessageCircle, ExternalLink, CheckCircle2, AlertTriangle, Ban, ArrowRightLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDayLabel, formatPhone, formatTime, whatsappLink } from "@/lib/format";
import { getAllWhatsAppStates, ensureAllWhatsAppStarted } from "@/lib/whatsapp/client";
import { whatsappLineLabel } from "@/lib/whatsapp/lines";
import { sectorLabel } from "@/lib/whatsapp/sectors";
import { qrToDataUrl } from "@/lib/whatsapp/qr";
import { canManageQueue as managesQueue, sentMessagePermissions } from "@/lib/whatsapp/message-permissions";
import {
  QUEUE_VIEW_COOKIE,
  groupByQueueSection,
  loadQueueViewer,
  parseQueueView,
  queueBlockReason,
  queueListWhere,
  seesWholeTeam,
} from "@/lib/whatsapp/queue";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AutoRefresh } from "@/components/whatsapp/AutoRefresh";
import { ReplyForm } from "@/components/whatsapp/ReplyForm";
import { MessageActions } from "@/components/whatsapp/MessageActions";
import { ChatImage } from "@/components/whatsapp/ChatImage";
import { QueueColumns, QueueLegend } from "@/components/whatsapp/QueueColumns";
import { NewConversationDialog } from "@/components/whatsapp/NewConversationDialog";
import { TransferDialog } from "@/components/whatsapp/TransferDialog";
import { ContactInfo } from "@/components/whatsapp/ContactInfo";
import { canAccess } from "@/lib/permissions";
import { getSessionFeatures, requireFeature } from "@/lib/session";
import {
  connectWhatsAppAction,
  disconnectWhatsAppAction,
  cancelWhatsAppConnectionAction,
  sendSupportReply,
  resolveConversation,
  claimConversation,
  releaseConversation,
  editSupportMessage,
  deleteSupportMessage,
  setSupportView,
  transferConversation,
} from "./actions";

const AVISOS: Record<string, string> = {
  "nao-entregue":
    "A resposta foi salva na conversa, mas essa linha do WhatsApp está desconectada — o cliente não recebeu. Reconecte acima e reenvie.",
  "numero-invalido":
    "A resposta foi salva na conversa, mas o número de telefone salvo para esse contato é inválido — o cliente não recebeu. Corrija o telefone do cliente antes de reenviar.",
  "avaliacao-nao-enviada":
    "A conversa foi marcada como resolvida, mas o pedido de avaliação não foi enviado (linha do WhatsApp desconectada).",
  "avaliacao-numero-invalido":
    "A conversa foi marcada como resolvida, mas o pedido de avaliação não foi enviado (o número de telefone salvo para esse contato é inválido).",
  "ja-assumida": "Essa conversa já tinha sido assumida por outro atendente um instante antes.",
  "assumida-por-outro":
    "Essa conversa foi assumida por outro atendente — sua ação não foi aplicada (a resposta não foi enviada).",
  "outro-setor":
    "Essa conversa foi transferida para outro setor — sua ação não foi aplicada (a resposta não foi enviada).",
};

// Anexo de uma mensagem apagada: a mídia sai da conversa, fica só a menção.
const MEDIA_LABELS: Record<string, string> = { image: "foto", video: "vídeo", audio: "áudio", document: "documento" };

// Fundo da conversa: pontinhos bem fracos, no lugar do papel de parede do WhatsApp.
const CHAT_WALLPAPER = "bg-[radial-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:18px_18px]";

export default async function WhatsappSuportePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; aviso?: string; novo?: string }>;
}) {
  const session = await requireFeature("whatsapp_suporte");
  const features = await getSessionFeatures(session);
  // Todo mundo vê a própria fila — em espera (do seu setor e da entrada geral)
  // + as que estão com a pessoa. CEO e Gerente ainda podem abrir/mexer em
  // qualquer conversa e trocar a coluna Em atendimento pra visão "Equipe" (ver
  // lib/whatsapp/queue.ts).
  const canManageQueue = managesQueue(session.role);
  const viewer = await loadQueueViewer(session);
  const view = parseQueueView((await cookies()).get(QUEUE_VIEW_COOKIE)?.value);
  const teamView = seesWholeTeam(viewer, view);

  const params = await searchParams;

  // Religa cada linha automaticamente se já foi pareada antes e o socket caiu
  // num deploy/restart. No-op nas que já estão conectadas/conectando.
  await ensureAllWhatsAppStarted();
  const waStates = getAllWhatsAppStates();

  const qrByLine: Record<string, string> = {};
  for (const s of waStates) {
    if (s.qr) qrByLine[s.line] = await qrToDataUrl(s.qr);
  }
  const anyPairing = waStates.some((s) => s.status === "qr" || s.status === "connecting");

  const aviso = params.aviso ? (AVISOS[params.aviso] ?? null) : null;

  // "Conversar pelo CRM" da ficha do cliente chega com ?novo=<id>: abre a
  // Nova conversa já com ele escolhido.
  const newChatCustomer = params.novo
    ? await prisma.customer.findUnique({ where: { id: params.novo }, select: { id: true, name: true, phone: true } })
    : null;

  const conversations = await prisma.conversation.findMany({
    where: queueListWhere(viewer, view),
    orderBy: { lastMessageAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, phone: true, bairro: true } },
      rating: true,
      assignedTo: { select: { id: true, name: true } },
      // Últimas mensagens pra lista: a mais nova dá a prévia e se quem falou
      // por último foi o cliente (sem resposta — negrito, igual o WhatsApp); a
      // sequência dele no fim dá há quanto tempo espera. Apagada pra todos não
      // conta: a resposta que sumiu não respondeu nada.
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { direction: true, body: true, mediaType: true, createdAt: true },
      },
    },
  });

  const sections = groupByQueueSection(conversations, viewer, view);
  // Sem ?c=, abre a primeira da fila — nunca uma finalizada (igual ao
  // firstInQueue, pra onde vai quem acabou de concluir um atendimento).
  const activeId =
    params.c ?? sections.filter((s) => s.section !== "resolved").flatMap((s) => s.conversations)[0]?.id;
  const activeRaw = activeId
    ? await prisma.conversation.findUnique({
        where: { id: activeId },
        include: {
          customer: true,
          rating: true,
          resolvedBy: { select: { name: true } },
          assignedTo: { select: { id: true, name: true } },
          messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { name: true } } } },
          transfers: { orderBy: { createdAt: "asc" }, include: { byUser: { select: { name: true } } } },
        },
      })
    : null;
  // Mesma regra da lista: quem não é CEO/Gerente não abre (nem por link
  // direto com o id) uma conversa assumida por outro atendente ou que está na
  // espera de outro setor.
  const active = activeRaw && queueBlockReason(viewer, activeRaw) ? null : activeRaw;

  // Mensagens e transferências na ordem em que aconteceram.
  const timeline = active
    ? [
        ...active.messages.map((m) => ({ kind: "message" as const, at: m.createdAt, m })),
        ...active.transfers.map((t) => ({ kind: "transfer" as const, at: t.createdAt, t })),
      ].sort((a, b) => a.at.getTime() - b.at.getTime())
    : [];
  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">WhatsApp Suporte</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {teamView
              ? "Visão da equipe: todas as conversas · duas linhas"
              : `Sua fila: clientes em espera e os que estão com você · ${
                  viewer.sector ? `setor ${sectorLabel(viewer.sector)}` : "sem setor"
                }`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <QueueLegend showResolved={teamView} />
          <NewConversationDialog
            lines={waStates.map((s) => ({
              id: s.line,
              label: whatsappLineLabel(s.line),
              connected: s.status === "connected",
            }))}
            initialCustomer={newChatCustomer}
            autoOpen={Boolean(newChatCustomer)}
          />
        </div>
      </div>

      {aviso && (
        <div className="rounded-lg border border-status-critical/30 bg-status-critical/10 px-4 py-3 text-sm text-status-critical">
          {aviso}
        </div>
      )}

      <Card>
        <div className="space-y-3">
          {waStates.map((s) => (
            <div key={s.line} className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink-primary">{whatsappLineLabel(s.line)}</span>
                {s.status === "connected" ? (
                  <Badge status="good">Conectado{s.phoneNumber ? ` · ${s.phoneNumber}` : ""}</Badge>
                ) : s.status === "qr" ? (
                  <Badge status="warning">Aguardando leitura do QR code</Badge>
                ) : s.status === "connecting" ? (
                  <Badge status="warning">Conectando...</Badge>
                ) : (
                  <Badge status="critical">Desconectado</Badge>
                )}
              </div>

              {s.status === "connected" ? (
                <form action={disconnectWhatsAppAction.bind(null, s.line)}>
                  <button type="submit" className="text-sm text-status-critical hover:underline">
                    Desconectar
                  </button>
                </form>
              ) : s.status === "connecting" || s.status === "qr" ? (
                <form action={cancelWhatsAppConnectionAction.bind(null, s.line)}>
                  <button type="submit" className="text-sm text-ink-muted hover:text-ink-secondary hover:underline">
                    Cancelar
                  </button>
                </form>
              ) : s.status === "disconnected" ? (
                <form action={connectWhatsAppAction.bind(null, s.line)}>
                  <button
                    type="submit"
                    className="rounded-lg bg-gold-400 text-page font-semibold px-4 py-2 text-sm hover:bg-gold-300 transition-colors"
                  >
                    Conectar
                  </button>
                </form>
              ) : null}
              {s.status === "disconnected" && s.lastError && (
                <p className="w-full text-xs text-status-critical">{s.lastError}</p>
              )}
            </div>
          ))}
        </div>

        {waStates
          .filter((s) => qrByLine[s.line])
          .map((s) => (
            <div key={s.line} className="mt-4 flex flex-col items-center gap-3 py-4 border-t border-border">
              <p className="text-sm font-medium text-ink-primary">{whatsappLineLabel(s.line)}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrByLine[s.line]}
                alt={`QR code do WhatsApp — ${whatsappLineLabel(s.line)}`}
                width={256}
                height={256}
                className="rounded-lg"
              />
              <p className="text-sm text-ink-secondary text-center max-w-sm">
                No celular da <strong>{whatsappLineLabel(s.line)}</strong>: WhatsApp → Configurações → Aparelhos
                conectados → Conectar um aparelho, e escaneie este código.
              </p>
            </div>
          ))}

        {/* Rápido enquanto espera o QR; devagar depois, só pra o inbox pegar
            mensagens novas sem F5 manual. */}
        <AutoRefresh intervalMs={anyPairing ? 2500 : 12000} />
      </Card>

      {/* Duas colunas da fila (Em espera | Em atendimento) e o chat ao lado. Em
          tela média (lg) não cabem três colunas ao lado da barra lateral: as duas
          listas ficam empilhadas; do xl pra cima o wrapper vira "contents" e cada
          lista ocupa a própria coluna do grid. */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[270px_270px_minmax(0,1fr)] 2xl:grid-cols-[320px_320px_minmax(0,1fr)] gap-4 lg:h-[calc(100vh-340px)] lg:min-h-[480px]">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-2 gap-4 min-h-0 xl:contents">
          <QueueColumns
            sections={sections}
            activeId={activeId}
            userId={session.userId}
            currentToolbar={
              canManageQueue ? (
                <div className="flex gap-1 px-3 py-2 border-b border-wa-border bg-wa-list">
                  {(["mine", "team"] as const).map((v) => (
                    <form key={v} action={setSupportView.bind(null, v)} className="flex-1">
                      <button
                        type="submit"
                        aria-pressed={view === v}
                        className={`w-full rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                          view === v ? "bg-wa-green/20 text-wa-green" : "bg-wa-panel text-wa-muted hover:text-wa-text"
                        }`}
                      >
                        {v === "mine" ? "Meus" : "Equipe"}
                      </button>
                    </form>
                  ))}
                </div>
              ) : undefined
            }
          />
        </div>

        <div className="rounded-2xl border border-wa-border bg-wa-bg overflow-hidden flex flex-col min-h-0 h-[75vh] lg:h-auto">
          {active ? (
            <>
              <div className="flex items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 bg-wa-panel flex-wrap">
                <ContactInfo
                  key={active.customer.id}
                  canOpenCustomer={canAccess(features, "clientes")}
                  contact={{
                    id: active.customer.id,
                    name: active.customer.name,
                    phoneLabel: formatPhone(active.customer.phone),
                    details: [
                      formatPhone(active.customer.phone),
                      active.customer.bairro,
                      whatsappLineLabel(active.line),
                      active.sector && sectorLabel(active.sector),
                    ]
                      .filter(Boolean)
                      .join(" · "),
                    bairro: active.customer.bairro,
                    customerSince: formatDate(active.customer.createdAt),
                    whatsappUrl: whatsappLink(active.customer.phone),
                  }}
                />
                <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
                  {active.rating && <Badge status="good">{active.rating.score}★ avaliação</Badge>}
                  <Badge status={active.status === "OPEN" ? "good" : "neutral"}>
                    {active.status === "OPEN" ? "Em aberto" : "Resolvido"}
                    {active.resolvedBy ? ` por ${active.resolvedBy.name}` : ""}
                  </Badge>
                  {active.assignedTo ? (
                    <>
                      <Badge status="warning">
                        {active.assignedTo.id === session.userId ? "Com você" : `Com ${active.assignedTo.name}`}
                      </Badge>
                      {(active.assignedTo.id === session.userId || canManageQueue) && (
                        <form action={releaseConversation.bind(null, active.id)}>
                          <button type="submit" className="text-xs text-wa-muted hover:text-wa-text">
                            Liberar
                          </button>
                        </form>
                      )}
                    </>
                  ) : active.status === "OPEN" ? (
                    <form action={claimConversation.bind(null, active.id)}>
                      <button type="submit" className="text-xs font-medium text-wa-green hover:brightness-110">
                        Assumir atendimento
                      </button>
                    </form>
                  ) : null}
                  {active.status === "OPEN" && (
                    <TransferDialog
                      key={active.id}
                      action={transferConversation.bind(null, active.id)}
                      currentSector={active.sector}
                    />
                  )}
                  {active.status === "OPEN" && (
                    <form action={resolveConversation.bind(null, active.id)}>
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 text-xs text-wa-green hover:brightness-110"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Resolvido
                      </button>
                    </form>
                  )}
                  <Link
                    href={`/admin/ocorrencias/novo?clienteId=${active.customer.id}`}
                    className="inline-flex items-center gap-1.5 text-xs text-wa-muted hover:text-status-critical"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> Ocorrência
                  </Link>
                  <a
                    href={whatsappLink(active.customer.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-wa-muted hover:text-wa-text"
                    title="Abrir no WhatsApp"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* flex-col-reverse: a rolagem já começa no fim (mensagem mais
                  nova), e a atualização automática não pula pro topo. */}
              <div className={`flex-1 overflow-y-auto flex flex-col-reverse px-4 sm:px-[6%] py-3 ${CHAT_WALLPAPER}`}>
                <div className="space-y-1.5">
                  {timeline.map((item, i) => {
                    // Separador de dia ("Hoje", "Ontem", data) quando o dia muda.
                    const dayLabel = formatDayLabel(item.at, now);
                    const showDay = i === 0 || formatDayLabel(timeline[i - 1].at, now) !== dayLabel;
                    const daySeparator = showDay && (
                      <div className="flex justify-center py-1.5">
                        <span className="rounded-lg bg-wa-note px-3 py-1 text-[12.5px] text-wa-muted shadow-sm">
                          {dayLabel}
                        </span>
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

                    // Apagada pra todos (pelo CRM, pelo celular ou pelo cliente):
                    // igual o WhatsApp mostra o aviso no lugar, mas a equipe ainda
                    // enxerga o que era, riscado — é histórico do atendimento.
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

                    const rules = out ? sentMessagePermissions(m, session) : null;
                    const showActions = Boolean(rules && (rules.canEdit || rules.canDelete));
                    // Hora dentro do balão, no canto de baixo, igual o WhatsApp: a
                    // cópia invisível reserva o espaço no fim do texto.
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
                              <video
                                src={`/api/whatsapp/media/${m.mediaUrl}`}
                                controls
                                className="rounded-lg max-w-full max-h-64 mb-1.5"
                              />
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
                              className={`absolute bottom-1 right-2 text-[11px] leading-none ${
                                out ? "text-white/60" : "text-wa-muted"
                              }`}
                            >
                              {meta}
                            </span>
                          </div>
                          {showActions ? (
                            <MessageActions
                              // Remonta depois de uma edição salva: fecha a caixa e
                              // pega o texto novo.
                              key={m.editedAt?.getTime() ?? 0}
                              senderLabel={senderLabel}
                              text={m.body}
                              editAction={rules?.canEdit ? editSupportMessage.bind(null, m.id) : undefined}
                              deleteAction={rules?.canDelete ? deleteSupportMessage.bind(null, m.id) : undefined}
                            />
                          ) : (
                            out && <span className="text-[10px] text-wa-muted mt-0.5 mr-1">{senderLabel}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {timeline.length === 0 && (
                    <p className="text-center text-sm text-wa-muted py-6">Nenhuma mensagem ainda.</p>
                  )}
                </div>
              </div>

              <ReplyForm
                // Limpa a caixa só quando a própria pessoa manda (a última dela
                // muda) — mensagem nova do cliente não apaga o que está digitando.
                key={`${active.id}-${active.messages.findLast((m) => m.senderId === session.userId)?.id ?? ""}`}
                action={sendSupportReply.bind(null, active.id)}
                placeholder={`Mensagem pela ${whatsappLineLabel(active.line)}`}
              />
            </>
          ) : (
            <div className={`flex-1 flex items-center justify-center text-sm text-wa-muted ${CHAT_WALLPAPER}`}>
              <div className="text-center">
                <MessageCircle className="w-10 h-10 mx-auto mb-2 text-wa-muted" />
                Selecione uma conversa
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
