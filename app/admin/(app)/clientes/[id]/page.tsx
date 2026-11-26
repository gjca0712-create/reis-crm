import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MessageCircle,
  MessageSquarePlus,
  Pencil,
  MapPin,
  Mail,
  IdCard,
  Gift,
  Handshake,
  Cake,
  HardHat,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { whatsappSaleDate, whatsappSaleWhere } from "@/lib/customers/purchases";
import { formatCurrency, formatDate, formatBirthday, formatPhone, whatsappLink } from "@/lib/format";
import { recencyBucket, daysUntilBirthday, RECENCY_LABELS, RECENCY_STATUS } from "@/lib/calculations";
import { PROFISSAO_LABELS, FASE_OBRA_LABELS } from "@/lib/constants";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { requireFeature, getSessionFeatures } from "@/lib/session";
import { canAccess } from "@/lib/permissions";
import { followUpLabel, outcomeInfo, quoteLostReasonLabel } from "@/lib/whatsapp/outcome";
import { whatsappLineLabel } from "@/lib/whatsapp/lines";

// Atendimentos do WhatsApp mostrados na ficha (os mais recentes).
const CONVERSATIONS_SHOWN = 15;

// Histórico de compras: as vendas lançadas no CRM e os atendimentos do
// WhatsApp marcados Venda (lib/customers/purchases.ts), do mais novo pro mais antigo.
type Purchase =
  | {
      kind: "crm";
      date: Date;
      sale: Prisma.SaleGetPayload<{ include: { partner: { select: { name: true } }; items: true } }>;
    }
  | {
      kind: "whatsapp";
      date: Date;
      conversation: { id: string; number: number; outcomeAgent: { name: string } | null; value: number };
    };

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireFeature("clientes");
  const { id } = await params;
  const canChat = canAccess(await getSessionFeatures(session), "whatsapp_suporte");

  const customerQuery = prisma.customer.findUnique({
    where: { id },
    include: {
      referredBy: true,
      sales: { orderBy: { date: "desc" }, include: { partner: { select: { name: true } }, items: true } },
      conversations: {
        orderBy: { createdAt: "desc" },
        take: CONVERSATIONS_SHOWN,
        select: {
          id: true,
          number: true,
          createdAt: true,
          line: true,
          status: true,
          outcome: true,
          outcomeValue: true,
          quoteStatus: true,
          quoteLostReason: true,
          followUpAt: true,
          outcomeAgent: { select: { name: true } },
          assignedTo: { select: { name: true } },
        },
      },
      _count: { select: { conversations: true } },
    },
  });
  // Compras pelo WhatsApp (conversas marcadas Venda), todas — não só as 15
  // conversas mais recentes da lista de atendimentos.
  const whatsappSalesQuery = prisma.conversation.findMany({
    where: { customerId: id, ...whatsappSaleWhere() },
    select: {
      id: true,
      number: true,
      createdAt: true,
      outcomeAt: true,
      outcomeValue: true,
      outcomeAgent: { select: { name: true } },
    },
  });
  const [customer, whatsappSales] = await Promise.all([customerQuery, whatsappSalesQuery]);

  if (!customer) notFound();
  const now = new Date();

  const purchases: Purchase[] = [
    ...customer.sales.map((sale) => ({ kind: "crm" as const, date: sale.date, sale })),
    ...whatsappSales.map((c) => ({
      kind: "whatsapp" as const,
      date: whatsappSaleDate(c),
      conversation: { ...c, value: c.outcomeValue === null ? 0 : Number(c.outcomeValue) },
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());
  const bucket = recencyBucket(purchases[0]?.date ?? null);
  const totalGasto = purchases.reduce(
    (sum, p) => sum + (p.kind === "crm" ? p.sale.total : p.conversation.value),
    0
  );
  const purchasesHint =
    whatsappSales.length === 0
      ? `${purchases.length} compra${purchases.length === 1 ? "" : "s"}`
      : whatsappSales.length === purchases.length
        ? `${purchases.length} compra${purchases.length === 1 ? "" : "s"} pelo WhatsApp`
        : `${purchases.length} compras · ${whatsappSales.length} pelo WhatsApp`;
  const waMessage = `Olá ${customer.name.split(" ")[0]}, aqui é da Reis Materiais de Construção!`;
  const birthdayDays = daysUntilBirthday(customer.birthday);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-ink-primary">{customer.name}</h1>
            <Badge status={RECENCY_STATUS[bucket]}>{RECENCY_LABELS[bucket]}</Badge>
            {customer.faseObra && (
              <Badge status="neutral">
                <HardHat className="w-3.5 h-3.5" /> {FASE_OBRA_LABELS[customer.faseObra] ?? customer.faseObra}
              </Badge>
            )}
            {birthdayDays !== null && birthdayDays <= 7 && (
              <Badge status="neutral">
                <Cake className="w-3.5 h-3.5" /> {birthdayDays === 0 ? "Aniversário hoje!" : `Aniversário em ${birthdayDays} dia${birthdayDays === 1 ? "" : "s"}`}
              </Badge>
            )}
          </div>
          <p className="text-sm text-ink-muted mt-0.5">
            {customer.isContact ? "Contato desde" : "Cliente desde"} {formatDate(customer.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/clientes/${customer.id}/editar`}
            className="inline-flex items-center gap-2 rounded-lg border border-border-strong text-ink-primary px-4 py-2.5 text-sm font-medium hover:bg-surface-raised transition-colors"
          >
            <Pencil className="w-4 h-4" /> Editar
          </Link>
          {/* Pelas linhas da loja, com a conversa registrada no Suporte — o
              "Abrir WhatsApp" ao lado abre o WhatsApp de quem está usando. */}
          {canChat && (
            <Link
              href={`/admin/whatsapp/suporte?novo=${customer.id}`}
              className="inline-flex items-center gap-2 rounded-lg bg-gold-400 text-page px-4 py-2.5 text-sm font-semibold hover:bg-gold-300 transition-colors"
            >
              <MessageSquarePlus className="w-4 h-4" /> Conversar pelo CRM
            </Link>
          )}
          <a
            href={whatsappLink(customer.phone, waMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-status-good text-page px-4 py-2.5 text-sm font-semibold hover:brightness-110 transition-all"
          >
            <MessageCircle className="w-4 h-4" /> Abrir WhatsApp
          </a>
        </div>
      </div>

      {customer.isContact && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-400/40 bg-gold-400/10 px-5 py-4">
          <p className="text-sm text-ink-secondary">
            <span className="font-medium text-ink-primary">Contato do WhatsApp, ainda sem cadastro.</span> Fica em
            “Contatos do WhatsApp” até alguém completar nome e bairro, ou até ele comprar.
          </p>
          <Link
            href={`/admin/clientes/${customer.id}/editar`}
            className="inline-flex items-center gap-2 rounded-lg bg-gold-400 text-page px-4 py-2 text-sm font-semibold hover:bg-gold-300 transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Completar cadastro
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-ink-primary">Dados do cliente</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <InfoRow icon={MessageCircle} label="WhatsApp" value={formatPhone(customer.phone)} />
            <InfoRow icon={Mail} label="E-mail" value={customer.email ?? "—"} />
            <InfoRow icon={MapPin} label="Bairro" value={`${customer.bairro}${customer.city ? " · " + customer.city : ""}`} />
            <InfoRow icon={IdCard} label="CPF/CNPJ" value={customer.document ?? "—"} />
            <InfoRow icon={Cake} label="Aniversário" value={customer.birthday ? formatBirthday(customer.birthday) : "—"} />
            {customer.referredBy && (
              <InfoRow
                icon={Handshake}
                label="Indicado por"
                value={`${customer.referredBy.name} (${PROFISSAO_LABELS[customer.referredBy.profissao] ?? customer.referredBy.profissao})`}
              />
            )}
          </div>
          {customer.address && <p className="text-sm text-ink-secondary pt-2 border-t border-border">{customer.address}</p>}
          {customer.notes && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-ink-muted mb-1">Observações</p>
              <p className="text-sm text-ink-secondary">{customer.notes}</p>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 text-ink-secondary text-sm mb-1">
              <Gift className="w-4 h-4 text-gold-400" /> Pontos de fidelidade
            </div>
            <div className="text-2xl font-semibold text-ink-primary">{customer.loyaltyPoints}</div>
          </Card>
          <Card>
            <div className="text-ink-secondary text-sm mb-1">Total gasto</div>
            <div className="text-2xl font-semibold text-ink-primary">{formatCurrency(totalGasto)}</div>
            <div className="text-xs text-ink-muted mt-1">{purchasesHint}</div>
          </Card>
        </div>
      </div>

      <Card title="Atendimentos no WhatsApp">
        {customer.conversations.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhum atendimento pelo WhatsApp ainda.</p>
        ) : (
          <div className="space-y-3">
            <ul className="divide-y divide-border/60">
              {customer.conversations.map((c) => {
                const outcome = outcomeInfo(c.outcome);
                const value = c.outcomeValue === null ? 0 : Number(c.outcomeValue);
                const agent = c.outcomeAgent?.name ?? c.assignedTo?.name;
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                    <div className="min-w-0">
                      <span className="text-ink-primary font-medium">#{c.number}</span>
                      <span className="text-ink-muted">
                        {" "}
                        · {formatDate(c.createdAt)} · {whatsappLineLabel(c.line)}
                        {agent && ` · ${agent}`}
                        {c.status === "OPEN" && " · em aberto"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {outcome ? (
                        <span className="inline-flex items-center gap-1.5 text-ink-primary">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: outcome.color }} aria-hidden />
                          {outcome.label}
                          {value > 0 && <span className="tabular-nums text-ink-secondary">{formatCurrency(value)}</span>}
                        </span>
                      ) : (
                        <span className="text-ink-muted">Sem resultado marcado</span>
                      )}
                      {c.quoteStatus === "ABERTO" && (
                        <span className="text-ink-muted">
                          retorno {c.followUpAt ? followUpLabel(c.followUpAt, now).text : "amanhã"}
                        </span>
                      )}
                      {c.quoteStatus === "VENDIDO" && c.outcome !== "VENDA" && (
                        <span className="text-ink-muted">virou venda</span>
                      )}
                      {c.quoteStatus === "VENDIDO" && c.outcome === "VENDA" && (
                        <span className="text-ink-muted">veio de um orçamento</span>
                      )}
                      {c.quoteStatus === "PERDIDO" && (
                        <span className="text-ink-muted">
                          não fechou · {quoteLostReasonLabel(c.quoteLostReason) ?? "sem motivo"}
                        </span>
                      )}
                      {canChat && (
                        <Link
                          href={`/admin/whatsapp/suporte?c=${c.id}`}
                          className="text-gold-400 hover:text-gold-300"
                        >
                          Abrir
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {customer._count.conversations > customer.conversations.length && (
              <p className="text-xs text-ink-muted">
                Mostrando os {customer.conversations.length} mais recentes de {customer._count.conversations}.
              </p>
            )}
          </div>
        )}
      </Card>

      <Card title="Histórico de compras">
        {purchases.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhuma compra registrada ainda.</p>
        ) : (
          <div className="space-y-5">
            {purchases.map((p) => {
              if (p.kind === "whatsapp") {
                const c = p.conversation;
                return (
                  <div
                    key={`wa-${c.id}`}
                    className="flex items-center justify-between flex-wrap gap-2 border-b border-border/60 last:border-0 pb-5 last:pb-0"
                  >
                    <div className="text-sm">
                      <span className="text-ink-primary font-medium">{formatDate(p.date)}</span>
                      <span className="text-ink-muted">
                        {" "}
                        · <MessageCircle className="inline w-3.5 h-3.5 -mt-0.5 text-status-good" aria-hidden /> pelo
                        WhatsApp · atendimento #{c.number}
                        {c.outcomeAgent && ` · ${c.outcomeAgent.name}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      {c.value > 0 ? (
                        <span className="font-semibold text-ink-primary tabular-nums">{formatCurrency(c.value)}</span>
                      ) : (
                        <span className="text-ink-muted">sem valor marcado</span>
                      )}
                      {canChat && (
                        <Link href={`/admin/whatsapp/suporte?c=${c.id}`} className="text-gold-400 hover:text-gold-300">
                          Abrir
                        </Link>
                      )}
                    </div>
                  </div>
                );
              }
              const s = p.sale;
              return (
              <div key={s.id} className="border-b border-border/60 last:border-0 pb-5 last:pb-0">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="text-sm">
                    <span className="text-ink-primary font-medium">{formatDate(s.date)}</span>
                    {s.partner && <span className="text-ink-muted"> · indicado por {s.partner.name}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-semibold text-ink-primary tabular-nums">{formatCurrency(s.total)}</span>
                    <span className="text-gold-400 tabular-nums">+{s.pointsEarned} pts</span>
                  </div>
                </div>
                {s.items.length > 0 && (
                  <ul className="text-sm text-ink-secondary space-y-1">
                    {s.items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-4">
                        <span className="truncate">
                          {item.quantity} × {item.productName}
                        </span>
                        <span className="tabular-nums text-ink-muted shrink-0">{formatCurrency(item.subtotal)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {s.notes && <p className="text-xs text-ink-muted mt-1.5 italic">{s.notes}</p>}
              </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-ink-muted mt-0.5 shrink-0" />
      <div>
        <div className="text-xs text-ink-muted">{label}</div>
        <div className="text-ink-primary">{value}</div>
      </div>
    </div>
  );
}
