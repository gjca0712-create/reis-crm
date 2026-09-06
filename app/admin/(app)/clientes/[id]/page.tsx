import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Pencil, MapPin, Mail, IdCard, Gift, Handshake, Cake, HardHat, type LucideIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, formatBirthday, formatPhone, whatsappLink } from "@/lib/format";
import { recencyBucket, daysUntilBirthday, RECENCY_LABELS, RECENCY_STATUS } from "@/lib/calculations";
import { PROFISSAO_LABELS, FASE_OBRA_LABELS } from "@/lib/constants";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      referredBy: true,
      sales: { orderBy: { date: "desc" }, include: { partner: { select: { name: true } }, items: true } },
    },
  });

  if (!customer) notFound();

  const bucket = recencyBucket(customer.sales[0]?.date ?? null);
  const totalGasto = customer.sales.reduce((sum, s) => sum + s.total, 0);
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
          <p className="text-sm text-ink-muted mt-0.5">Cliente desde {formatDate(customer.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/clientes/${customer.id}/editar`}
            className="inline-flex items-center gap-2 rounded-lg border border-border-strong text-ink-primary px-4 py-2.5 text-sm font-medium hover:bg-surface-raised transition-colors"
          >
            <Pencil className="w-4 h-4" /> Editar
          </Link>
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
            <div className="text-xs text-ink-muted mt-1">
              {customer.sales.length} compra{customer.sales.length === 1 ? "" : "s"}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Histórico de compras">
        {customer.sales.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhuma compra registrada ainda.</p>
        ) : (
          <div className="space-y-5">
            {customer.sales.map((s) => (
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
            ))}
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
