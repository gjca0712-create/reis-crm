import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Headphones, Inbox, MessageSquare, Users } from "lucide-react";
import { requireFeature } from "@/lib/session";
import { formatDate } from "@/lib/format";
import {
  METRICS_PERIODS,
  PHONE_AGENT,
  formatDuration,
  loadSupportMetrics,
  parseMetricsPeriod,
} from "@/lib/whatsapp/metrics";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";

export default async function MetricasAtendimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireFeature("whatsapp_gestao");
  const period = parseMetricsPeriod((await searchParams).periodo);
  const now = new Date();
  const m = await loadSupportMetrics(period, now);
  const maxServed = Math.max(...m.agents.map((a) => a.conversations), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Métricas de atendimento</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            WhatsApp Suporte · {period === "hoje" ? "hoje" : `de ${formatDate(m.start)} até agora`}
          </p>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Período">
          {METRICS_PERIODS.map((p) => (
            <Link
              key={p.id}
              href={`?periodo=${p.id}`}
              aria-current={p.id === period ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                p.id === period
                  ? "border-gold-400/40 bg-gold-400/15 text-gold-400"
                  : "border-border bg-surface text-ink-secondary hover:text-ink-primary"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-muted">Agora</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatTile label="Em espera" value={String(m.waitingNow)} icon={Inbox} hint="Ninguém assumiu ainda" />
          <StatTile label="Em atendimento" value={String(m.assignedNow)} icon={Headphones} hint="Com alguém da equipe" />
          <StatTile
            label="Sem resposta há +4h"
            value={String(m.overdueNow)}
            icon={AlertTriangle}
            hint={m.overdueNow ? "Veja na aba Sem resposta +4h do Suporte" : "Ninguém esperando tanto"}
            className={m.overdueNow ? "border-status-critical/40" : undefined}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-muted">No período</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatTile
            label="Clientes atendidos"
            value={String(m.conversationsServed)}
            icon={Users}
            hint={`${m.newConversations} atendimento${m.newConversations === 1 ? "" : "s"} novo${m.newConversations === 1 ? "" : "s"}`}
          />
          <StatTile
            label="Finalizados"
            value={String(m.resolved)}
            icon={CheckCircle2}
            hint={
              m.ratingAvg !== null
                ? `Avaliação média ${m.ratingAvg.toFixed(1)} ★ (${m.ratingCount})`
                : "Nenhuma avaliação no período"
            }
          />
          <StatTile
            label="Tempo de resposta"
            value={formatDuration(m.medianResponseMs)}
            icon={Clock}
            hint={
              m.answeredWithinHourPct !== null
                ? `${m.answeredWithinHourPct}% respondidos em até 1 h`
                : "Nenhuma resposta no período"
            }
          />
          <StatTile
            label="Mensagens recebidas"
            value={String(m.received)}
            icon={MessageSquare}
            hint={`${m.sent} enviadas pela equipe`}
          />
        </div>
      </section>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-5 pb-4">
          <h3 className="text-sm font-semibold text-ink-primary">Quem mais atende</h3>
          <p className="text-xs text-ink-muted mt-0.5">Ordenado por clientes atendidos no período</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-y border-border bg-surface-raised/40 whitespace-nowrap">
                <th className="font-medium py-3 px-5">Atendente</th>
                <th className="font-medium py-3 px-4 min-w-[200px]">Clientes atendidos</th>
                <th className="font-medium py-3 px-4 text-right">Mensagens</th>
                <th className="font-medium py-3 px-4 text-right">Finalizados</th>
                <th className="font-medium py-3 px-4 text-right">Tempo de resposta</th>
                <th className="font-medium py-3 px-4 text-right">Transferiu</th>
                <th className="font-medium py-3 px-4 text-right">Atendendo agora</th>
                <th className="font-medium py-3 px-4 text-right">Avaliação</th>
              </tr>
            </thead>
            <tbody>
              {m.agents.map((a, i) => {
                const phone = a.id === PHONE_AGENT;
                return (
                  <tr key={a.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 px-5 whitespace-nowrap">
                      <span className="inline-block w-5 text-ink-muted tabular-nums">{phone ? "" : `${i + 1}.`}</span>
                      <span className={phone ? "text-ink-secondary italic" : "text-ink-primary font-medium"}>{a.name}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 rounded-full bg-surface-raised overflow-hidden">
                          <div
                            className={`h-full rounded-full ${phone ? "bg-ink-muted" : "bg-gold-400"}`}
                            style={{ width: `${a.conversations ? Math.max((a.conversations / maxServed) * 100, 3) : 0}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-ink-primary font-semibold tabular-nums">{a.conversations}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-ink-secondary tabular-nums">{a.sent}</td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      {phone ? (
                        <span className="text-ink-muted">—</span>
                      ) : a.resolved ? (
                        <Link href={`/admin/whatsapp/antigas?a=${a.id}`} className="text-ink-secondary hover:text-gold-400 hover:underline">
                          {a.resolved}
                        </Link>
                      ) : (
                        <span className="text-ink-secondary">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-ink-secondary tabular-nums whitespace-nowrap">
                      {formatDuration(a.medianResponseMs)}
                    </td>
                    <td className="py-3 px-4 text-right text-ink-secondary tabular-nums">{phone ? "—" : a.transfers}</td>
                    <td className="py-3 px-4 text-right text-ink-secondary tabular-nums">{phone ? "—" : a.assignedNow}</td>
                    <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">
                      {a.ratingAvg !== null ? (
                        <span className="text-ink-primary">
                          {a.ratingAvg.toFixed(1)} ★ <span className="text-ink-muted">({a.ratingCount})</span>
                        </span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {m.agents.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-ink-muted">
                    Nenhum atendimento no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="text-xs text-ink-muted space-y-1 max-w-3xl">
        <p>
          <strong className="font-medium text-ink-secondary">Clientes atendidos:</strong> conversas em que a pessoa
          mandou pelo menos uma mensagem no período (o mesmo cliente atendido por duas pessoas conta pras duas).
        </p>
        <p>
          <strong className="font-medium text-ink-secondary">Tempo de resposta:</strong> o tempo típico entre o cliente
          escrever e alguém responder — metade das respostas sai mais rápido que isso. Conta também a noite e o fim de
          semana. &quot;Obrigado&quot; e 👍 do cliente não contam como espera; o pedido de avaliação automático não conta
          como resposta.
        </p>
        <p>
          <strong className="font-medium text-ink-secondary">Pelo celular:</strong> respostas mandadas direto do
          celular da linha, fora do CRM.
        </p>
      </div>
    </div>
  );
}
