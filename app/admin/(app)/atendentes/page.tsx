import { prisma } from "@/lib/prisma";
import { requireCeo } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/constants";
import { Card } from "@/components/ui/Card";
import { createAgent } from "./actions";

const inputClass =
  "w-full rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50";

export default async function AtendentesPage() {
  await requireCeo();

  const [users, ratingStats] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.rating.groupBy({ by: ["agentId"], _avg: { score: true }, _count: { _all: true } }),
  ]);

  const statsByAgent = new Map(ratingStats.filter((r) => r.agentId).map((r) => [r.agentId as string, r]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Atendentes</h1>
        <p className="text-sm text-ink-muted mt-0.5">Usuários da equipe e desempenho no atendimento</p>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border bg-surface-raised/40">
                <th className="font-medium py-3 px-5">Nome</th>
                <th className="font-medium py-3 px-4">E-mail</th>
                <th className="font-medium py-3 px-4">Perfil</th>
                <th className="font-medium py-3 px-4">Avaliação média</th>
                <th className="font-medium py-3 px-4">Desde</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const stats = statsByAgent.get(u.id);
                return (
                  <tr key={u.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 px-5 text-ink-primary font-medium">{u.name}</td>
                    <td className="py-3 px-4 text-ink-secondary">{u.email}</td>
                    <td className="py-3 px-4 text-ink-secondary">{ROLE_LABELS[u.role] ?? u.role}</td>
                    <td className="py-3 px-4 text-ink-primary tabular-nums">
                      {stats && stats._avg.score ? `${stats._avg.score.toFixed(1)} ★ (${stats._count._all})` : "—"}
                    </td>
                    <td className="py-3 px-4 text-ink-muted tabular-nums">{formatDate(u.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Novo atendente">
        <form action={createAgent} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm text-ink-secondary mb-1.5">Nome completo *</span>
            <input name="name" required className={inputClass} placeholder="Nome do atendente" />
          </label>
          <label className="block">
            <span className="block text-sm text-ink-secondary mb-1.5">E-mail *</span>
            <input name="email" type="email" required className={inputClass} placeholder="atendente@reismateriais.com.br" />
          </label>
          <label className="block">
            <span className="block text-sm text-ink-secondary mb-1.5">Senha *</span>
            <input name="password" type="password" required minLength={6} className={inputClass} placeholder="Mínimo 6 caracteres" />
          </label>
          <label className="block">
            <span className="block text-sm text-ink-secondary mb-1.5">Perfil</span>
            <select name="role" defaultValue="ATENDENTE" className={inputClass}>
              <option value="ATENDENTE">Atendente</option>
              <option value="VENDEDOR">Vendedor</option>
              <option value="GERENTE">Gerente</option>
              <option value="CEO">CEO</option>
            </select>
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-gold-400 text-page font-semibold px-5 py-2.5 text-sm hover:bg-gold-300 transition-colors"
            >
              Criar atendente
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
