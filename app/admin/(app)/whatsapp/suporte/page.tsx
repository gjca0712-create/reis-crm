import Link from "next/link";
import { cookies } from "next/headers";
import { MessageCircle, ExternalLink, CheckCircle2, AlertTriangle, MessageSquarePlus, MessagesSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, formatPhone, whatsappLink } from "@/lib/format";
import { getAllWhatsAppStates, ensureAllWhatsAppStarted } from "@/lib/whatsapp/client";
import { WHATSAPP_LINES, whatsappLineLabel } from "@/lib/whatsapp/lines";
import { SECTORS, sectorLabel } from "@/lib/whatsapp/sectors";
import { qrToDataUrl } from "@/lib/whatsapp/qr";
import { canManageQueue as managesQueue, sentMessagePermissions } from "@/lib/whatsapp/message-permissions";
import {
  QUEUE_TAB_COOKIE,
  QUEUE_VIEW_COOKIE,
  groupByQueueSection,
  loadQueueViewer,
  overdueConversations,
  parseQueueTab,
  parseQueueView,
  queueBlockReason,
  queueListWhere,
  seesWholeTeam,
  withWaitingSince,
} from "@/lib/whatsapp/queue";
import {
  NO_SECTOR,
  SUPPORT_FILTERS_COOKIE,
  effectiveSupportFilters,
  hasFilterParams,
  parseSupportFilters,
  parseSupportFiltersCookie,
  sortQueue,
  supportFilterWhere,
  supportOrderBy,
  type SupportFilterParams,
} from "@/lib/whatsapp/filters";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AutoRefresh } from "@/components/whatsapp/AutoRefresh";
import { ReplyForm } from "@/components/whatsapp/ReplyForm";
import { MessageActions } from "@/components/whatsapp/MessageActions";
import { ChatTimeline, CHAT_WALLPAPER } from "@/components/whatsapp/ChatTimeline";
import { QueueList, QueueLegend } from "@/components/whatsapp/QueueList";
import { FinishedList } from "@/components/whatsapp/FinishedList";
import { SupportFilters } from "@/components/whatsapp/SupportFilters";
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
  setSupportTab,
  saveSupportFilters,
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

// Finalizados (filtro Situação), por página.
const FINISHED_PAGE_SIZE = 30;

export default async function WhatsappSuportePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; aviso?: string; novo?: string; p?: string } & SupportFilterParams>;
}) {
  const session = await requireFeature("whatsapp_suporte");
  const features = await getSessionFeatures(session);
  // Todo mundo vê a própria fila — em espera (do seu setor e da entrada geral)
  // + as que estão com a pessoa. CEO e Gerente ainda podem abrir/mexer em
  // qualquer conversa e trocar a fila pra visão "Equipe", com as dos colegas
  // (ver lib/whatsapp/queue.ts).
  const canManageQueue = managesQueue(session.role);
  const viewer = await loadQueueViewer(session);
  const cookieStore = await cookies();
  const view = parseQueueView(cookieStore.get(QUEUE_VIEW_COOKIE)?.value);
  const tab = parseQueueTab(cookieStore.get(QUEUE_TAB_COOKIE)?.value);
  const teamView = seesWholeTeam(viewer, view);

  const params = await searchParams;

  // Filtros (lib/whatsapp/filters.ts): do cookie, ou de um link que os trouxe
  // na URL. Finalizados — as conversas que já saíram da fila — só CEO/Gerente.
  const canSeeFinished = canAccess(features, "whatsapp_gestao");
  const filtersFromUrl = hasFilterParams(params);
  const filters = effectiveSupportFilters(
    filtersFromUrl
      ? parseSupportFilters(params)
      : parseSupportFiltersCookie(cookieStore.get(SUPPORT_FILTERS_COOKIE)?.value),
    { canSeeFinished, teamView }
  );
  const finished = filters.status === "finalizados";
  const agentFilter = canSeeFinished ? (teamView ? "always" : "finalizados") : "never";
  const filterWhere = supportFilterWhere(filters);
  const page = Math.max(1, Math.floor(Number(params.p)) || 1);

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

  const conversations = finished
    ? []
    : await prisma.conversation.findMany({
          where: { AND: [queueListWhere(viewer, view), filterWhere] },
          orderBy: supportOrderBy(filters.order),
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

  const [finishedTotal, finishedConversations, agentUsers] = await Promise.all([
    finished ? prisma.conversation.count({ where: filterWhere }) : 0,
    finished
      ? prisma.conversation.findMany({
          where: filterWhere,
          orderBy: supportOrderBy(filters.order),
          skip: (page - 1) * FINISHED_PAGE_SIZE,
          take: FINISHED_PAGE_SIZE,
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            assignedTo: { select: { name: true } },
            resolvedBy: { select: { name: true } },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { direction: true, body: true, mediaType: true, sender: { select: { name: true } } },
            },
          },
        })
      : [],
    // Pro filtro de atendentes: quem já pegou ou finalizou alguma conversa.
    agentFilter === "never"
      ? []
      : prisma.user.findMany({
          where: { OR: [{ assignedConversations: { some: {} } }, { resolvedConversations: { some: {} } }] },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
  ]);
  const finishedPages = Math.max(1, Math.ceil(finishedTotal / FINISHED_PAGE_SIZE));
  // Atendente só escolhe entre os setores que enxerga (o dele e a entrada geral).
  const sectorOptions = [
    ...SECTORS.map((s) => ({ id: s.id as string, label: s.label })),
    { id: NO_SECTOR, label: "Geral (sem setor)" },
  ].filter((o) => canManageQueue || o.id === NO_SECTOR || o.id === viewer.sector);

  const now = new Date();
  const sections = groupByQueueSection(sortQueue(await withWaitingSince(conversations), filters.order), viewer, view);
  const open = sections.filter((s) => s.section !== "resolved").flatMap((s) => s.conversations);
  // Aba "Sem resposta +4h": das que a pessoa vê (espera + as dela; Equipe:
  // todas), as que esperam resposta há mais de 4h — o contador aparece sempre.
  const overdue = overdueConversations(open, now);
  // Sem ?c=, abre a primeira da fila (ou da aba +4h) — nunca uma finalizada
  // (igual ao firstInQueue, pra onde vai quem acabou de concluir um atendimento).
  // Nos finalizados, nada aberto até clicar, igual ao painel antigo.
  const activeId = finished
    ? params.c
    : (params.c ?? (tab === "atrasadas" ? overdue[0]?.id : undefined) ?? open[0]?.id);
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
  // direto com o id) uma conversa assumida por outro atendente, que está na
  // espera de outro setor ou que já foi finalizada.
  const active =
    activeRaw && (queueBlockReason(viewer, activeRaw) || (activeRaw.status === "RESOLVED" && !canSeeFinished))
      ? null
      : activeRaw;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">WhatsApp Suporte</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {finished
              ? `Atendimentos finalizados · ${finishedTotal} ${finishedTotal === 1 ? "conversa" : "conversas"}`
              : teamView
                ? "Visão da equipe: todas as conversas · duas linhas"
                : `Sua fila: clientes em espera e os que estão com você · ${
                    viewer.sector ? `setor ${sectorLabel(viewer.sector)}` : "sem setor"
                  }`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {!finished && <QueueLegend />}
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

      {/* Uma coluna só, igual ao painel de atendimentos que a loja usava: o
          filtro (busca + Situação/Ordem/...) embutido no topo e embaixo a fila
          inteira (Em espera, Com você, Com a equipe) — ou, em Finalizados, as
          conversas antigas. O chat ao lado. */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)] 2xl:grid-cols-[440px_minmax(0,1fr)] gap-4 lg:h-[calc(100vh-340px)] lg:min-h-[560px]">
        {/* Sem overflow-hidden: o painel de filtros sai por cima da borda. */}
        <div className="rounded-2xl border border-wa-border bg-wa-list flex flex-col min-h-0 max-h-[75vh] lg:max-h-none">
          <SupportFilters
            filters={filters}
            canSeeFinished={canSeeFinished}
            agentFilter={agentFilter}
            sectors={sectorOptions}
            agents={agentUsers.map((u) => ({ id: u.id, label: u.name }))}
            lines={WHATSAPP_LINES.map((l) => ({ id: l.id as string, label: l.label }))}
            count={finished ? finishedTotal : open.length}
            fromUrl={filtersFromUrl}
            save={saveSupportFilters}
          >
            {!finished && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-full bg-wa-panel p-0.5">
                  {(["fila", "atrasadas"] as const).map((t) => (
                    <form key={t} action={setSupportTab.bind(null, t)}>
                      <button
                        type="submit"
                        aria-pressed={tab === t}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                          tab === t ? "bg-wa-green/20 text-wa-green" : "text-wa-muted hover:text-wa-text"
                        }`}
                      >
                        {t === "fila" ? "Fila" : "Sem resposta +4h"}
                        {t === "atrasadas" && overdue.length > 0 && (
                          <span className="min-w-[18px] rounded-full bg-[rgb(244,63,94)] px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
                            {overdue.length}
                          </span>
                        )}
                      </button>
                    </form>
                  ))}
                </div>
                {canManageQueue && (
                  <div className="inline-flex rounded-full bg-wa-panel p-0.5">
                    {(["mine", "team"] as const).map((v) => (
                      <form key={v} action={setSupportView.bind(null, v)}>
                        <button
                          type="submit"
                          aria-pressed={view === v}
                          className={`rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                            view === v ? "bg-wa-green/20 text-wa-green" : "text-wa-muted hover:text-wa-text"
                          }`}
                        >
                          {v === "mine" ? "Meus" : "Equipe"}
                        </button>
                      </form>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SupportFilters>
          {finished ? (
            <FinishedList
              conversations={finishedConversations}
              activeId={activeId}
              page={page}
              pages={finishedPages}
              now={now}
            />
          ) : (
            <QueueList
              sections={sections}
              activeId={activeId}
              userId={session.userId}
              overdue={overdue}
              showOverdue={tab === "atrasadas"}
            />
          )}
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
                    number: active.number,
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
                    {active.status === "OPEN" ? "Em aberto" : "Finalizado"}
                    {active.resolvedBy ? ` por ${active.resolvedBy.name}` : ""}
                    {active.status !== "OPEN" && active.resolvedAt ? ` · ${formatDate(active.resolvedAt)}` : ""}
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
                <ChatTimeline
                  messages={active.messages}
                  transfers={active.transfers}
                  now={now}
                  actionsFor={(m, senderLabel) => {
                    const rules = sentMessagePermissions(m, session);
                    if (!rules.canEdit && !rules.canDelete) return null;
                    return (
                      <MessageActions
                        // Remonta depois de uma edição salva: fecha a caixa e
                        // pega o texto novo.
                        key={m.editedAt?.getTime() ?? 0}
                        senderLabel={senderLabel}
                        text={m.body}
                        editAction={rules.canEdit ? editSupportMessage.bind(null, m.id) : undefined}
                        deleteAction={rules.canDelete ? deleteSupportMessage.bind(null, m.id) : undefined}
                      />
                    );
                  }}
                />
              </div>

              {active.status === "RESOLVED" ? (
                // Finalizado é histórico: cada atendimento é uma conversa, e o
                // cliente que volta a escrever abre outra. Pra chamar ele de
                // novo, uma conversa nova (já com o cliente escolhido).
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-4 py-3 bg-wa-panel text-xs text-wa-muted text-center">
                  <span>
                    Atendimento finalizado
                    {active.resolvedAt ? ` em ${formatDateTime(active.resolvedAt)}` : ""} — só leitura. Se o cliente
                    escrever de novo, abre um atendimento novo.
                  </span>
                  <Link
                    href={`/admin/whatsapp/suporte?novo=${active.customer.id}`}
                    className="inline-flex items-center gap-1.5 font-medium text-wa-green hover:brightness-110"
                  >
                    <MessageSquarePlus className="w-4 h-4" /> Nova conversa
                  </Link>
                </div>
              ) : (
                <ReplyForm
                  // Limpa a caixa só quando a própria pessoa manda (a última dela
                  // muda) — mensagem nova do cliente não apaga o que está digitando.
                  key={`${active.id}-${active.messages.findLast((m) => m.senderId === session.userId)?.id ?? ""}`}
                  action={sendSupportReply.bind(null, active.id)}
                  placeholder={`Mensagem pela ${whatsappLineLabel(active.line)}`}
                />
              )}
            </>
          ) : finished ? (
            <div className={`flex-1 flex items-center justify-center p-6 text-center ${CHAT_WALLPAPER}`}>
              <div>
                <span className="mx-auto mb-4 w-24 h-24 rounded-full bg-wa-panel flex items-center justify-center">
                  <MessagesSquare className="w-10 h-10 text-wa-muted" />
                </span>
                <p className="text-base font-medium text-wa-text">Nenhuma conversa aberta!</p>
                <p className="text-sm text-wa-muted mt-1">Selecione um atendimento finalizado para ver o histórico.</p>
              </div>
            </div>
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
