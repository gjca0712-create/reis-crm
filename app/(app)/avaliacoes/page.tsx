import { Star } from "lucide-react";
import { requireCeo } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";

export default async function AvaliacoesPage() {
  await requireCeo();

  const [allRatings, agentStats] = await Promise.all([
    prisma.rating.findMany({
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true } }, agent: { select: { name: true } } },
    }),
    prisma.rating.groupBy({ by: ["agentId"], _avg: { score: true }, _count: { _all: true } }),
  ]);

  const total = allRatings.length;
  const average = total > 0 ? allRatings.reduce((s, r) => s + r.score, 0) / total : 0;
  const distribution = [5, 4, 3, 2, 1].map((score) => ({
    score,
    count: allRatings.filter((r) => r.score === score).length,
  }));
  const maxCount = Math.max(...distribution.map((d) => d.count), 1);
  const recentRatings = allRatings.slice(0, 30);

  const agentIds = agentStats.filter((a) => a.agentId).map((a) => a.agentId as string);
  const agents = await prisma.user.findMany({ where: { id: { in: agentIds } } });
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Avaliações</h1>
        <p className="text-sm text-ink-muted mt-0.5">Como a equipe está indo no atendimento</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatTile label="Avaliação média" value={total > 0 ? `${average.toFixed(1)} ★` : "—"} icon={Star} />
        <StatTile label="Total de avaliações" value={String(total)} icon={Star} />
      </div>

      <Card title="Distribuição de notas">
        <div className="space-y-2.5">
          {distribution.map((d) => (
            <div key={d.score} className="flex items-center gap-3">
              <span className="text-sm text-ink-secondary w-10">{d.score} ★</span>
              <div className="flex-1 h-2.5 rounded-full bg-surface-raised overflow-hidden">
                <div
                  className="h-full rounded-full bg-gold-400"
                  style={{ width: `${d.count > 0 ? Math.max((d.count / maxCount) * 100, 4) : 0}%` }}
                />
              </div>
              <span className="text-sm text-ink-primary w-8 text-right tabular-nums">{d.count}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Desempenho por atendente" className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border bg-surface-raised/40">
                <th className="font-medium py-3 px-5">Atendente</th>
                <th className="font-medium py-3 px-4 text-right">Avaliações</th>
                <th className="font-medium py-3 px-4 text-right">Média</th>
              </tr>
            </thead>
            <tbody>
              {agentStats
                .filter((a) => a.agentId)
                .sort((a, b) => (b._avg.score ?? 0) - (a._avg.score ?? 0))
                .map((a) => {
                  const agent = agentMap.get(a.agentId as string);
                  return (
                    <tr key={a.agentId} className="border-b border-border/60 last:border-0">
                      <td className="py-3 px-5 text-ink-primary font-medium">{agent?.name ?? "—"}</td>
                      <td className="py-3 px-4 text-right text-ink-secondary tabular-nums">{a._count._all}</td>
                      <td className="py-3 px-4 text-right text-gold-400 font-semibold tabular-nums">
                        {(a._avg.score ?? 0).toFixed(1)} ★
                      </td>
                    </tr>
                  );
                })}
              {agentStats.filter((a) => a.agentId).length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-ink-muted">
                    Nenhuma avaliação com atendente identificado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Avaliações recentes">
        <div className="space-y-2">
          {recentRatings.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between text-sm py-2 border-b border-border/60 last:border-0"
            >
              <div>
                <span className="text-ink-primary">{r.customer.name}</span>
                <span className="text-ink-muted"> · {r.agent?.name ?? "sem atendente"}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gold-400 font-semibold">{r.score} ★</span>
                <span className="text-xs text-ink-muted">{formatDate(r.createdAt)}</span>
              </div>
            </div>
          ))}
          {recentRatings.length === 0 && <p className="text-sm text-ink-muted">Nenhuma avaliação recebida ainda.</p>}
        </div>
      </Card>
    </div>
  );
}
