import Link from "next/link";
import { MessageCircle, ExternalLink, CheckCircle2, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime, whatsappLink } from "@/lib/format";
import { getWhatsAppState } from "@/lib/whatsapp/client";
import { qrToDataUrl } from "@/lib/whatsapp/qr";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AutoRefresh } from "@/components/whatsapp/AutoRefresh";
import { requireFeature } from "@/lib/session";
import { connectWhatsAppAction, disconnectWhatsAppAction, sendSupportReply, resolveConversation } from "./actions";

export default async function WhatsappSuportePage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await requireFeature("whatsapp_suporte");

  const params = await searchParams;
  const waState = getWhatsAppState();

  const conversations = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    include: { customer: { select: { id: true, name: true, phone: true, bairro: true } }, rating: true },
  });

  const activeId = params.c ?? conversations[0]?.id;
  const active = activeId
    ? await prisma.conversation.findUnique({
        where: { id: activeId },
        include: {
          customer: true,
          rating: true,
          resolvedBy: { select: { name: true } },
          messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { name: true } } } },
        },
      })
    : null;

  const qrDataUrl = waState.qr ? await qrToDataUrl(waState.qr) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">WhatsApp Suporte</h1>
        <p className="text-sm text-ink-muted mt-0.5">Conversas de atendimento com clientes</p>
      </div>

      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          {waState.status === "connected" ? (
            <Badge status="good">Conectado{waState.phoneNumber ? ` · ${waState.phoneNumber}` : ""}</Badge>
          ) : waState.status === "qr" ? (
            <Badge status="warning">Aguardando leitura do QR code</Badge>
          ) : waState.status === "connecting" ? (
            <Badge status="warning">Conectando...</Badge>
          ) : (
            <Badge status="critical">Desconectado</Badge>
          )}

          {waState.status === "connected" ? (
            <form action={disconnectWhatsAppAction}>
              <button type="submit" className="text-sm text-status-critical hover:underline">
                Desconectar
              </button>
            </form>
          ) : waState.status === "disconnected" ? (
            <form action={connectWhatsAppAction}>
              <button
                type="submit"
                className="rounded-lg bg-gold-400 text-page font-semibold px-4 py-2 text-sm hover:bg-gold-300 transition-colors"
              >
                Conectar WhatsApp
              </button>
            </form>
          ) : null}
        </div>

        {qrDataUrl && (
          <div className="mt-4 flex flex-col items-center gap-3 py-4 border-t border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR code do WhatsApp" width={256} height={256} className="rounded-lg" />
            <p className="text-sm text-ink-secondary text-center max-w-sm">
              Abra o WhatsApp no celular que vai atender → Configurações → Aparelhos conectados → Conectar um
              aparelho, e escaneie este código.
            </p>
          </div>
        )}

        {(waState.status === "qr" || waState.status === "connecting") && <AutoRefresh />}

        {waState.status === "disconnected" && (
          <p className="text-xs text-ink-muted mt-3">
            Conexão não-oficial (protocolo do WhatsApp Web), atrelada ao número real que você escanear. Use com
            cuidado — o WhatsApp pode restringir números que automatizam conversas.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-360px)] min-h-[420px]">
        <Card className="p-0 overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-1">
            {conversations.map((c) => (
              <Link
                key={c.id}
                href={`/whatsapp/suporte?c=${c.id}`}
                className={`flex items-start gap-3 px-4 py-3 border-b border-border/60 hover:bg-surface-raised transition-colors ${
                  c.id === activeId ? "bg-surface-raised" : ""
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-gold-400/15 border border-gold-700/40 flex items-center justify-center text-xs font-semibold text-gold-400 shrink-0">
                  {c.customer.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink-primary truncate">{c.customer.name}</span>
                    {c.status === "OPEN" && (
                      <span className="w-2 h-2 rounded-full bg-status-good shrink-0" title="Em aberto" />
                    )}
                  </div>
                  <div className="text-xs text-ink-muted truncate">
                    {c.customer.bairro}
                    {c.rating && <span className="text-gold-400"> · {c.rating.score}★</span>}
                  </div>
                </div>
              </Link>
            ))}
            {conversations.length === 0 && <p className="text-sm text-ink-muted p-4">Nenhuma conversa ainda.</p>}
          </div>
        </Card>

        <Card className="p-0 overflow-hidden flex flex-col">
          {active ? (
            <>
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-wrap gap-2">
                <div>
                  <div className="text-sm font-semibold text-ink-primary">{active.customer.name}</div>
                  <div className="text-xs text-ink-muted">{active.customer.bairro}</div>
                </div>
                <div className="flex items-center gap-3">
                  {active.rating && <Badge status="good">{active.rating.score}★ avaliação</Badge>}
                  <Badge status={active.status === "OPEN" ? "good" : "neutral"}>
                    {active.status === "OPEN" ? "Em aberto" : "Resolvido"}
                    {active.resolvedBy ? ` por ${active.resolvedBy.name}` : ""}
                  </Badge>
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
                    href={`/ocorrencias/novo?clienteId=${active.customer.id}`}
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
                {active.messages.map((m) => (
                  <div key={m.id} className={`flex flex-col ${m.direction === "OUT" ? "items-end" : "items-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                        m.direction === "OUT"
                          ? "bg-gold-400 text-page rounded-br-sm"
                          : "bg-surface-raised text-ink-primary rounded-bl-sm"
                      }`}
                    >
                      <p>{m.body}</p>
                      <p className={`text-[10px] mt-1 ${m.direction === "OUT" ? "text-page/70" : "text-ink-muted"}`}>
                        {formatDateTime(m.createdAt)}
                      </p>
                    </div>
                    {m.direction === "OUT" && m.sender && (
                      <span className="text-[10px] text-ink-muted mt-0.5 mr-1">{m.sender.name}</span>
                    )}
                  </div>
                ))}
                {active.messages.length === 0 && <p className="text-sm text-ink-muted">Nenhuma mensagem ainda.</p>}
              </div>

              <form
                key={active.messages.length}
                action={sendSupportReply.bind(null, active.id)}
                className="border-t border-border p-3 flex items-end gap-2"
              >
                <textarea
                  name="body"
                  required
                  rows={1}
                  placeholder="Digite uma resposta..."
                  className="flex-1 resize-none rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-gold-400 text-page font-semibold px-4 py-2.5 text-sm hover:bg-gold-300 transition-colors shrink-0"
                >
                  Enviar
                </button>
              </form>
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
