import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus, MessageCircle, Cake, UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDate, formatPhone, whatsappLink } from "@/lib/format";
import { recencyBucket, daysUntilBirthday, RECENCY_LABELS, RECENCY_STATUS, type RecencyBucket } from "@/lib/calculations";
import { FASE_OBRA_LABELS, type FaseObra } from "@/lib/constants";
import { BAIRRO_NAO_INFORMADO } from "@/lib/customers/contact";
import { lastPurchaseDate, lastWhatsappSales, whatsappSaleWhere } from "@/lib/customers/purchases";
import { outcomeInfo } from "@/lib/whatsapp/outcome";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { requireFeature } from "@/lib/session";

const PAGE_SIZE = 50;
const DAY_MS = 86_400_000;

type Params = { q?: string; bairro?: string; recencia?: string; fase?: string; tipo?: string; p?: string };

// Recência pela data da última compra, igual ao recencyBucket (dias inteiros:
// "até 30 dias" = comprou há menos de 31 dias), mas no banco — a lista é
// paginada, então o filtro não pode ser feito depois de carregar. Compra =
// venda lançada no CRM ou atendimento do WhatsApp marcado Venda.
function recencyWhere(bucket: RecencyBucket | "", now: Date): Prisma.CustomerWhereInput {
  const since = (days?: number) => (days === undefined ? undefined : new Date(now.getTime() - (days + 1) * DAY_MS));
  const bought = (days?: number): Prisma.CustomerWhereInput => {
    const s = since(days);
    return { OR: [{ sales: { some: s ? { date: { gt: s } } : {} } }, { conversations: { some: whatsappSaleWhere(s) } }] };
  };
  const notBought = (days?: number): Prisma.CustomerWhereInput => {
    const s = since(days);
    return { AND: [{ sales: { none: s ? { date: { gt: s } } : {} } }, { conversations: { none: whatsappSaleWhere(s) } }] };
  };
  switch (bucket) {
    case "30":
      return bought(30);
    case "60":
      return { AND: [bought(60), notBought(30)] };
    case "90":
      return { AND: [bought(90), notBought(60)] };
    case "inativo":
      return { AND: [bought(), notBought(90)] };
    case "sem-compra":
      return notBought();
    default:
      return {};
  }
}

// Duas listas: Clientes (cadastrados ou que já compraram) e Contatos do
// WhatsApp (Customer.isContact — chegaram por mensagem e ainda não têm
// cadastro). Assim quem só mandou um "oi" não enche a lista de clientes.
export default async function ClientesPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireFeature("clientes");
  const params = await searchParams;
  const contacts = params.tipo === "contatos";
  const q = params.q?.trim() ?? "";
  const bairroFilter = contacts ? "" : (params.bairro ?? "");
  const recenciaFilter = (contacts ? "" : (params.recencia ?? "")) as RecencyBucket | "";
  const faseFilter = (contacts ? "" : (params.fase ?? "")) as FaseObra | "";
  const page = Math.max(1, Number.parseInt(params.p ?? "1", 10) || 1);
  const now = new Date();

  const where: Prisma.CustomerWhereInput = {
    AND: [
      { isContact: contacts },
      q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || q } }] } : {},
      bairroFilter ? { bairro: bairroFilter } : {},
      faseFilter ? { faseObra: faseFilter } : {},
      recencyWhere(recenciaFilter, now),
    ],
  };

  const [total, clientCount, contactCount, customers, bairros] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.count({ where: { isContact: false } }),
    prisma.customer.count({ where: { isContact: true } }),
    prisma.customer.findMany({
      where,
      include: {
        sales: { select: { date: true }, orderBy: { date: "desc" }, take: 1 },
        referredBy: { select: { name: true } },
        conversations: { select: { createdAt: true, outcome: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    contacts
      ? Promise.resolve([])
      : prisma.customer.findMany({
          where: { isContact: false, bairro: { not: BAIRRO_NAO_INFORMADO } },
          select: { bairro: true },
          distinct: ["bairro"],
          orderBy: { bairro: "asc" },
        }),
  ]);

  const whatsappSales = contacts ? new Map<string, Date>() : await lastWhatsappSales(customers.map((c) => c.id));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(q || bairroFilter || recenciaFilter || faseFilter);
  const query = (overrides: Partial<Params>) => {
    const next = { ...params, ...overrides };
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) search.set(key, value);
    const s = search.toString();
    return `/admin/clientes${s ? `?${s}` : ""}`;
  };
  const tabClass = (on: boolean) =>
    `inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
      on ? "bg-surface-raised text-ink-primary" : "text-ink-muted hover:text-ink-primary"
    }`;
  const selectClass =
    "w-full rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-gold-400/50";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Clientes</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {contacts
              ? `${total} contato${total === 1 ? "" : "s"} do WhatsApp sem cadastro`
              : `${total} cliente${total === 1 ? "" : "s"}`}
          </p>
        </div>
        <LinkButton href="/admin/clientes/novo">
          <Plus className="w-4 h-4" /> Novo cliente
        </LinkButton>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface p-1 w-fit">
        <Link href="/admin/clientes" className={tabClass(!contacts)}>
          Clientes <span className="text-ink-muted tabular-nums">{clientCount}</span>
        </Link>
        <Link href="/admin/clientes?tipo=contatos" className={tabClass(contacts)}>
          Contatos do WhatsApp <span className="text-ink-muted tabular-nums">{contactCount}</span>
        </Link>
      </div>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          {contacts && <input type="hidden" name="tipo" value="contatos" />}
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
          {!contacts && (
            <>
              <div className="min-w-[180px]">
                <label htmlFor="bairro" className="block text-xs text-ink-muted mb-1.5">
                  Bairro
                </label>
                <select id="bairro" name="bairro" defaultValue={bairroFilter} className={selectClass}>
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
                <select id="recencia" name="recencia" defaultValue={recenciaFilter} className={selectClass}>
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
                <select id="fase" name="fase" defaultValue={faseFilter} className={selectClass}>
                  <option value="">Todas</option>
                  {Object.entries(FASE_OBRA_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <button
            type="submit"
            className="rounded-lg bg-gold-400 text-page font-medium text-sm px-5 py-2.5 hover:bg-gold-300 transition-colors"
          >
            {contacts ? "Buscar" : "Filtrar"}
          </button>
          {hasFilters && (
            <Link
              href={contacts ? "/admin/clientes?tipo=contatos" : "/admin/clientes"}
              className="text-sm text-ink-muted hover:text-ink-primary px-2 py-2.5"
            >
              Limpar
            </Link>
          )}
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          {contacts ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-muted border-b border-border bg-surface-raised/40">
                  <th className="font-medium py-3 px-5">Contato</th>
                  <th className="font-medium py-3 px-4">Primeira mensagem</th>
                  <th className="font-medium py-3 px-4">Último atendimento</th>
                  <th className="font-medium py-3 px-4 text-right">Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const last = c.conversations[0];
                  const outcome = outcomeInfo(last?.outcome);
                  return (
                    <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-surface-raised/40">
                      <td className="py-3 px-5">
                        <Link href={`/admin/clientes/${c.id}`} className="text-ink-primary font-medium hover:text-gold-400">
                          {c.name}
                        </Link>
                        <div className="text-xs text-ink-muted">{formatPhone(c.phone)}</div>
                      </td>
                      <td className="py-3 px-4 text-ink-secondary whitespace-nowrap">{formatDate(c.createdAt)}</td>
                      <td className="py-3 px-4 text-ink-secondary whitespace-nowrap">
                        {last ? (
                          <span className="inline-flex items-center gap-2">
                            {formatDate(last.createdAt)}
                            {outcome && (
                              <span className="inline-flex items-center gap-1.5 text-ink-primary">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: outcome.color }} aria-hidden />
                                {outcome.label}
                              </span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/clientes/${c.id}/editar`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-surface-raised"
                          >
                            <UserPlus className="w-3.5 h-3.5" /> Completar cadastro
                          </Link>
                          <a
                            href={whatsappLink(c.phone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-status-good hover:bg-status-good/10"
                            title="Abrir WhatsApp"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-ink-muted">
                      {q ? "Nenhum contato encontrado." : "Nenhum contato sem cadastro. Tudo em dia!"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
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
                {customers.map((c) => {
                  const bucket = recencyBucket(lastPurchaseDate(c.sales[0]?.date, whatsappSales.get(c.id)));
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
                              title={
                                birthdayDays === 0
                                  ? "Aniversário hoje!"
                                  : `Aniversário em ${birthdayDays} dia${birthdayDays === 1 ? "" : "s"}`
                              }
                            >
                              <Cake className="w-3.5 h-3.5 text-gold-400 shrink-0" />
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-ink-muted">{formatPhone(c.phone)}</div>
                      </td>
                      <td className={`py-3 px-4 ${c.bairro === BAIRRO_NAO_INFORMADO ? "text-ink-muted" : "text-ink-secondary"}`}>
                        {c.bairro}
                      </td>
                      <td className="py-3 px-4 text-ink-secondary">{c.referredBy?.name ?? "—"}</td>
                      <td className="py-3 px-4 text-ink-primary tabular-nums">{c.loyaltyPoints}</td>
                      <td className="py-3 px-4 text-ink-secondary">{c.faseObra ? FASE_OBRA_LABELS[c.faseObra] : "—"}</td>
                      <td className="py-3 px-4">
                        <Badge status={RECENCY_STATUS[bucket]}>{RECENCY_LABELS[bucket]}</Badge>
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
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-ink-muted">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-muted">
            Página {Math.min(page, pages)} de {pages}
          </span>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link
                href={query({ p: page - 1 > 1 ? String(page - 1) : undefined })}
                className="rounded-lg border border-border-strong px-3.5 py-2 text-ink-primary hover:bg-surface-raised"
              >
                Anterior
              </Link>
            )}
            {page < pages && (
              <Link
                href={query({ p: String(page + 1) })}
                className="rounded-lg border border-border-strong px-3.5 py-2 text-ink-primary hover:bg-surface-raised"
              >
                Próxima
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
