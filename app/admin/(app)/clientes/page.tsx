import Link from "next/link";
import { Plus, MessageCircle, Cake } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatPhone, whatsappLink } from "@/lib/format";
import { recencyBucket, daysUntilBirthday, RECENCY_LABELS, RECENCY_STATUS, type RecencyBucket } from "@/lib/calculations";
import { FASE_OBRA_LABELS, type FaseObra } from "@/lib/constants";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { requireFeature } from "@/lib/session";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; bairro?: string; recencia?: string; fase?: string }>;
}) {
  await requireFeature("clientes");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const bairroFilter = params.bairro ?? "";
  const recenciaFilter = (params.recencia ?? "") as RecencyBucket | "";
  const faseFilter = (params.fase ?? "") as FaseObra | "";

  const [customers, bairros] = await Promise.all([
    prisma.customer.findMany({
      where: {
        AND: [
          q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }] } : {},
          bairroFilter ? { bairro: bairroFilter } : {},
          faseFilter ? { faseObra: faseFilter } : {},
        ],
      },
      include: {
        sales: { select: { date: true }, orderBy: { date: "desc" }, take: 1 },
        referredBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.customer.findMany({ select: { bairro: true }, distinct: ["bairro"], orderBy: { bairro: "asc" } }),
  ]);

  const rows = customers
    .map((c) => ({ ...c, bucket: recencyBucket(c.sales[0]?.date ?? null) }))
    .filter((c) => (recenciaFilter ? c.bucket === recenciaFilter : true));

  const hasFilters = Boolean(q || bairroFilter || recenciaFilter || faseFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Clientes</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {rows.length} cliente{rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <LinkButton href="/admin/clientes/novo">
          <Plus className="w-4 h-4" /> Novo cliente
        </LinkButton>
      </div>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label htmlFor="q" className="block text-xs text-ink-muted mb-1.5">
              Buscar
            </label>
            <input
              id="q"
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Nome ou telefone"
              className="w-full rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50"
            />
          </div>
          <div className="min-w-[180px]">
            <label htmlFor="bairro" className="block text-xs text-ink-muted mb-1.5">
              Bairro
            </label>
            <select
              id="bairro"
              name="bairro"
              defaultValue={bairroFilter}
              className="w-full rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-gold-400/50"
            >
              <option value="">Todos</option>
              {bairros.map((b) => (
                <option key={b.bairro} value={b.bairro}>
                  {b.bairro}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[180px]">
            <label htmlFor="recencia" className="block text-xs text-ink-muted mb-1.5">
              Recência
            </label>
            <select
              id="recencia"
              name="recencia"
              defaultValue={recenciaFilter}
              className="w-full rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-gold-400/50"
            >
              <option value="">Todas</option>
              <option value="30">Até 30 dias</option>
              <option value="60">Até 60 dias</option>
              <option value="90">Até 90 dias</option>
              <option value="inativo">Inativo (90+ dias)</option>
              <option value="sem-compra">Sem compras</option>
            </select>
          </div>
          <div className="min-w-[180px]">
            <label htmlFor="fase" className="block text-xs text-ink-muted mb-1.5">
              Fase da obra
            </label>
            <select
              id="fase"
              name="fase"
              defaultValue={faseFilter}
              className="w-full rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-gold-400/50"
            >
              <option value="">Todas</option>
              {Object.entries(FASE_OBRA_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-gold-400 text-page font-medium text-sm px-5 py-2.5 hover:bg-gold-300 transition-colors"
          >
            Filtrar
          </button>
          {hasFilters && (
            <Link href="/admin/clientes" className="text-sm text-ink-muted hover:text-ink-primary px-2 py-2.5">
              Limpar
            </Link>
          )}
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border bg-surface-raised/40">
                <th className="font-medium py-3 px-5">Cliente</th>
                <th className="font-medium py-3 px-4">Bairro</th>
                <th className="font-medium py-3 px-4">Indicado por</th>
                <th className="font-medium py-3 px-4">Pontos</th>
                <th className="font-medium py-3 px-4">Fase da obra</th>
                <th className="font-medium py-3 px-4">Recência</th>
                <th className="font-medium py-3 px-4 text-right">WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const birthdayDays = daysUntilBirthday(c.birthday);
                const birthdaySoon = birthdayDays !== null && birthdayDays <= 7;
                return (
                <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-surface-raised/40">
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/admin/clientes/${c.id}`} className="text-ink-primary font-medium hover:text-gold-400">
                        {c.name}
                      </Link>
                      {birthdaySoon && (
                        <span
                          title={birthdayDays === 0 ? "Aniversário hoje!" : `Aniversário em ${birthdayDays} dia${birthdayDays === 1 ? "" : "s"}`}
                        >
                          <Cake className="w-3.5 h-3.5 text-gold-400 shrink-0" />
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-muted">{formatPhone(c.phone)}</div>
                  </td>
                  <td className="py-3 px-4 text-ink-secondary">{c.bairro}</td>
                  <td className="py-3 px-4 text-ink-secondary">{c.referredBy?.name ?? "—"}</td>
                  <td className="py-3 px-4 text-ink-primary tabular-nums">{c.loyaltyPoints}</td>
                  <td className="py-3 px-4 text-ink-secondary">{c.faseObra ? FASE_OBRA_LABELS[c.faseObra] : "—"}</td>
                  <td className="py-3 px-4">
                    <Badge status={RECENCY_STATUS[c.bucket]}>{RECENCY_LABELS[c.bucket]}</Badge>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <a
                      href={whatsappLink(c.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-status-good hover:bg-status-good/10"
                      title="Abrir WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  </td>
                </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-ink-muted">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
