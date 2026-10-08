import Link from "next/link";
import { Archive, ChevronLeft, ChevronRight, ExternalLink, Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFeatures, requireFeature } from "@/lib/session";
import { canAccess } from "@/lib/permissions";
import { formatDate, formatDateTime, formatListTime, formatPhone, onlyDigits } from "@/lib/format";
import { whatsappLineLabel } from "@/lib/whatsapp/lines";
import { sectorLabel } from "@/lib/whatsapp/sectors";
import { Badge } from "@/components/ui/Badge";
import { ContactAvatar } from "@/components/whatsapp/ContactAvatar";
import { ChatTimeline, CHAT_WALLPAPER } from "@/components/whatsapp/ChatTimeline";

// Mensagens antigas: os atendimentos já finalizados (Resolvido), que saem da
// fila do Suporte — só CEO e Gerente (feature whatsapp_gestao), só leitura.
// Cliente que volta a escrever depois abre um atendimento novo no Suporte; o
// finalizado continua aqui.

const PAGE_SIZE = 30;

const inputClass =
  "rounded-lg bg-page border border-border px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50";

type Params = { q?: string; a?: string; p?: string; c?: string };

export default async function MensagensAntigasPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireFeature("whatsapp_gestao");
  const features = await getSessionFeatures(session);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const digits = onlyDigits(q);
  const agentId = params.a || undefined;
  const page = Math.max(1, Math.floor(Number(params.p)) || 1);

  const where: Prisma.ConversationWhereInput = {
    status: "RESOLVED",
    ...(agentId && { resolvedById: agentId }),
    ...(q && {
      customer: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ],
      },
    }),
  };

  const [total, conversations, agents] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: [{ resolvedAt: { sort: "desc", nulls: "last" } }, { lastMessageAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        resolvedBy: { select: { name: true } },
        rating: { select: { score: true } },
      },
    }),
    prisma.user.findMany({
      where: { resolvedConversations: { some: { status: "RESOLVED" } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const activeId = params.c ?? conversations[0]?.id;
  const active = activeId
    ? await prisma.conversation.findUnique({
        where: { id: activeId },
        include: {
          customer: true,
          rating: true,
          resolvedBy: { select: { name: true } },
          messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { name: true } } } },
          transfers: { orderBy: { createdAt: "asc" }, include: { byUser: { select: { name: true } } } },
        },
      })
    : null;

  // Links da lista/paginação mantêm a busca e o filtro.
  const href = (changes: Partial<Params>) => {
    const next = new URLSearchParams();
    const merged = { q: q || undefined, a: agentId, p: page > 1 ? String(page) : undefined, ...changes };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `?${s}` : "?";
  };
  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Mensagens antigas</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            Atendimentos finalizados no WhatsApp Suporte · {total} {total === 1 ? "conversa" : "conversas"}
          </p>
        </div>
        <form className="flex flex-wrap items-center gap-2" role="search">
          <div className="relative">
            <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Nome ou telefone"
              className={`${inputClass} pl-9 w-56`}
              aria-label="Buscar por nome ou telefone"
            />
          </div>
          <select name="a" defaultValue={agentId ?? ""} className={inputClass} aria-label="Finalizado por">
            <option value="">Todos os atendentes</option>
            {agents.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-gold-400 text-page font-semibold px-4 py-2 text-sm hover:bg-gold-300 transition-colors"
          >
            Buscar
          </button>
          {(q || agentId) && (
            <Link href="?" className="text-sm text-ink-muted hover:text-ink-secondary hover:underline">
              Limpar
            </Link>
          )}
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)] gap-4 lg:h-[calc(100vh-200px)] lg:min-h-[480px]">
        <div className="rounded-2xl border border-wa-border bg-wa-list overflow-hidden flex flex-col min-h-0 max-h-96 lg:max-h-none">
          <div className="overflow-y-auto flex-1 min-h-0">
            {conversations.map((c) => {
              const resolvedAt = c.resolvedAt ?? c.lastMessageAt;
              const details = [whatsappLineLabel(c.line), c.sector && sectorLabel(c.sector), c.rating && `${c.rating.score}★`]
                .filter(Boolean)
                .join(" · ");
              return (
                <Link
                  key={c.id}
                  href={href({ c: c.id })}
                  className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                    c.id === active?.id ? "bg-wa-active" : "hover:bg-wa-panel"
                  }`}
                >
                  <ContactAvatar customerId={c.customer.id} name={c.customer.name} className="w-11 h-11 text-base" />
                  <div className="min-w-0 flex-1 border-b border-wa-border/70 pb-2.5 -mb-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[15px] text-wa-text truncate">{c.customer.name}</span>
                      <span className="text-xs shrink-0 text-wa-muted" title={formatDateTime(resolvedAt)}>
                        {formatListTime(resolvedAt, now)}
                      </span>
                    </div>
                    <div className="text-[13px] text-wa-muted truncate mt-0.5">
                      {c.resolvedBy ? `Finalizado por ${c.resolvedBy.name}` : "Finalizado"}
                    </div>
                    <div className="text-[11px] text-wa-muted truncate mt-0.5">
                      {formatPhone(c.customer.phone)} · {details}
                    </div>
                  </div>
                </Link>
              );
            })}
            {conversations.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-wa-muted">
                {q || agentId ? "Nenhuma conversa finalizada com essa busca." : "Nenhuma conversa finalizada ainda."}
              </p>
            )}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-wa-border bg-wa-panel text-xs text-wa-muted">
              {page > 1 ? (
                <Link href={href({ p: String(page - 1), c: undefined })} className="inline-flex items-center gap-1 hover:text-wa-text">
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="tabular-nums">
                Página {page} de {pages}
              </span>
              {page < pages ? (
                <Link href={href({ p: String(page + 1), c: undefined })} className="inline-flex items-center gap-1 hover:text-wa-text">
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
                    <p className="text-[15px] font-medium text-wa-text truncate">{active.customer.name}</p>
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
                  <Badge status={active.status === "RESOLVED" ? "neutral" : "good"}>
                    {active.status === "RESOLVED"
                      ? `Finalizado${active.resolvedBy ? ` por ${active.resolvedBy.name}` : ""}${
                          active.resolvedAt ? ` · ${formatDateTime(active.resolvedAt)}` : ""
                        }`
                      : "Em aberto de novo"}
                  </Badge>
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
                Atendimento iniciado em {formatDate(active.createdAt)} · só leitura — se o cliente escrever de novo, abre
                um atendimento novo no Suporte.
              </div>
            </>
          ) : (
            <div className={`flex-1 flex items-center justify-center text-sm text-wa-muted ${CHAT_WALLPAPER}`}>
              <div className="text-center">
                <Archive className="w-10 h-10 mx-auto mb-2 text-wa-muted" />
                Selecione uma conversa
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
