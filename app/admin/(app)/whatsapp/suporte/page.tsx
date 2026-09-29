import Link from "next/link";
import { MessageCircle, ExternalLink, CheckCircle2, AlertTriangle, Ban } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatPhone, whatsappLink } from "@/lib/format";
import { getAllWhatsAppStates, ensureAllWhatsAppStarted } from "@/lib/whatsapp/client";
import { whatsappLineLabel } from "@/lib/whatsapp/lines";
import { qrToDataUrl } from "@/lib/whatsapp/qr";
import { canManageQueue as managesQueue, sentMessagePermissions } from "@/lib/whatsapp/message-permissions";
import { groupByQueueSection, queueListWhere } from "@/lib/whatsapp/queue";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AutoRefresh } from "@/components/whatsapp/AutoRefresh";
import { ReplyForm } from "@/components/whatsapp/ReplyForm";
import { MessageActions } from "@/components/whatsapp/MessageActions";
import { ChatImage } from "@/components/whatsapp/ChatImage";
import { QueueColumns, QueueLegend } from "@/components/whatsapp/QueueColumns";
import { requireFeature } from "@/lib/session";
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
};

// Anexo de uma mensagem apagada: a mídia sai da conversa, fica só a menção.
const MEDIA_LABELS: Record<string, string> = { image: "foto", video: "vídeo", audio: "áudio", document: "documento" };

export default async function WhatsappSuportePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; aviso?: string }>;
}) {
  const session = await requireFeature("whatsapp_suporte");
  // CEO e Gerente supervisionam a fila inteira; os demais só veem a própria
  // fila — em espera + as que estão com eles (ver lib/whatsapp/queue.ts).
  const canManageQueue = managesQueue(session.role);

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

  const conversations = await prisma.conversation.findMany({
    where: queueListWhere(session),
    orderBy: { lastMessageAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, phone: true, bairro: true } },
      rating: true,
      assignedTo: { select: { id: true, name: true } },
      // Só a última mensagem, pra saber se quem falou por último foi o
      // cliente (ainda não respondemos — negrito, igual o próprio WhatsApp)
      // ou nós (já respondido — peso normal). Apagada pra todos não conta: a
      // resposta que sumiu não respondeu nada.
      messages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { direction: true } },
    },
  });

  const sections = groupByQueueSection(conversations, session);
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
        },
      })
    : null;
  // Mesma regra da lista: quem não é CEO/Gerente não abre (nem por link
  // direto com o id) uma conversa assumida por outro atendente.
  const active =
    activeRaw && !canManageQueue && activeRaw.assignedToId && activeRaw.assignedToId !== session.userId
      ? null
      : activeRaw;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">WhatsApp Suporte</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {canManageQueue
              ? "Conversas de atendimento com clientes · duas linhas"
              : "Sua fila: clientes em espera e os que estão com você · duas linhas"}
          </p>
        </div>
        <QueueLegend showResolved={canManageQueue} />
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
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[250px_250px_minmax(0,1fr)] 2xl:grid-cols-[290px_290px_minmax(0,1fr)] gap-4 lg:h-[calc(100vh-340px)] lg:min-h-[480px]">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-2 gap-4 min-h-0 xl:contents">
          <QueueColumns sections={sections} activeId={activeId} userId={session.userId} />
        </div>

        <Card className="p-0 overflow-hidden flex flex-col min-h-0 h-[75vh] lg:h-auto">
          {active ? (
            <>
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-wrap gap-2">
                <div>
                  <div className="text-sm font-semibold text-ink-primary">{active.customer.name}</div>
                  <div className="text-xs text-ink-muted">
                    {formatPhone(active.customer.phone)} · {active.customer.bairro} · {whatsappLineLabel(active.line)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
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
                          <button type="submit" className="text-xs text-ink-muted hover:text-ink-secondary hover:underline">
                            Liberar
                          </button>
                        </form>
                      )}
                    </>
                  ) : active.status === "OPEN" ? (
                    <form action={claimConversation.bind(null, active.id)}>
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300"
                      >
                        Assumir atendimento
                      </button>
                    </form>
                  ) : null}
                  {active.status === "OPEN" && (
                    <form action={resolveConversation.bind(null, active.id)}>
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Marcar como resolvido
                      </button>
                    </form>
                  )}
                  <Link
                    href={`/admin/ocorrencias/novo?clienteId=${active.customer.id}`}
                    className="inline-flex items-center gap-1.5 text-xs text-status-critical hover:underline"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> Registrar ocorrência
                  </Link>
                  <a
                    href={whatsappLink(active.customer.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300"
                  >
                    Abrir no WhatsApp <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {active.messages.map((m) => {
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
                      <div key={m.id} className={`flex flex-col ${out ? "items-end" : "items-start"}`}>
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm border border-dashed border-border text-ink-muted ${
                            out ? "rounded-br-sm" : "rounded-bl-sm"
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
                          <p className="text-[10px] mt-1">
                            {formatDateTime(m.createdAt)} · apagada em {formatDateTime(m.deletedAt)}
                          </p>
                        </div>
                        {out && <span className="text-[10px] text-ink-muted mt-0.5 mr-1">{senderLabel}</span>}
                      </div>
                    );
                  }

                  const rules = out ? sentMessagePermissions(m, session) : null;
                  const showActions = Boolean(rules && (rules.canEdit || rules.canDelete));

                  return (
                  <div key={m.id} className={`group flex flex-col ${out ? "items-end" : "items-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                        m.direction === "OUT"
                          ? "bg-gold-400 text-page rounded-br-sm"
                          : "bg-surface-raised text-ink-primary rounded-bl-sm"
                      }`}
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
                      {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
                      <p className={`text-[10px] mt-1 ${out ? "text-page/70" : "text-ink-muted"}`}>
                        {formatDateTime(m.createdAt)}
                        {m.editedAt && (
                          <span title={m.originalBody ? `Antes da edição: ${m.originalBody}` : undefined}>
                            {" "}
                            · editada
                          </span>
                        )}
                      </p>
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
                      out && <span className="text-[10px] text-ink-muted mt-0.5 mr-1">{senderLabel}</span>
                    )}
                  </div>
                  );
                })}
                {active.messages.length === 0 && <p className="text-sm text-ink-muted">Nenhuma mensagem ainda.</p>}
              </div>

              <ReplyForm
                key={`${active.id}-${active.messages.length}`}
                action={sendSupportReply.bind(null, active.id)}
                placeholder={`Responder pela ${whatsappLineLabel(active.line)}...`}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-ink-muted">
              <div className="text-center">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 text-ink-muted" />
                Selecione uma conversa
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
