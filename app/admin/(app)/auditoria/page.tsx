import { requireCeo } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { AUDIT_ACTION_LABELS, type AuditAction } from "@/lib/audit";
import { Card } from "@/components/ui/Card";

const ACTION_STYLES: Record<string, string> = {
  "login.failure": "text-status-critical",
  "user.password_reset": "text-gold-400",
  "user.permissions_update": "text-gold-400",
  "user.permissions_reset": "text-gold-400",
};

function summarize(action: string, details: unknown): string {
  if (!details || typeof details !== "object") return "—";
  const d = details as Record<string, unknown>;

  if (action === "user.create") {
    return `Perfil: ${d.role ?? "—"}`;
  }

  if (action === "user.update") {
    const before = (d.before ?? {}) as Record<string, unknown>;
    const after = (d.after ?? {}) as Record<string, unknown>;
    const changes = Object.keys(after)
      .filter((k) => before[k] !== after[k])
      .map((k) => `${k}: ${String(before[k])} → ${String(after[k])}`);
    return changes.length ? changes.join(" · ") : "sem mudanças";
  }

  if (action === "user.permissions_update") {
    const before = Array.isArray(d.before) ? (d.before as string[]) : [];
    const after = Array.isArray(d.after) ? (d.after as string[]) : [];
    const added = after.filter((f) => !before.includes(f));
    const removed = before.filter((f) => !after.includes(f));
    const parts = [];
    if (added.length) parts.push(`+${added.join(", ")}`);
    if (removed.length) parts.push(`−${removed.join(", ")}`);
    return parts.length ? parts.join(" ") : "sem mudanças";
  }

  return "—";
}

export default async function AuditoriaPage() {
  await requireCeo();

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Auditoria</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Histórico de login e de mudanças feitas em contas de usuário — últimos {logs.length} registros.
        </p>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border bg-surface-raised/40">
                <th className="font-medium py-3 px-5">Quando</th>
                <th className="font-medium py-3 px-4">Quem</th>
                <th className="font-medium py-3 px-4">Ação</th>
                <th className="font-medium py-3 px-4">Alvo</th>
                <th className="font-medium py-3 px-4">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border/60 last:border-0 align-top">
                  <td className="py-3 px-5 text-ink-muted whitespace-nowrap tabular-nums">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="py-3 px-4 text-ink-secondary">
                    {log.actorName}
                    {log.actorEmail && <div className="text-xs text-ink-muted">{log.actorEmail}</div>}
                  </td>
                  <td className={`py-3 px-4 font-medium ${ACTION_STYLES[log.action] ?? "text-ink-primary"}`}>
                    {AUDIT_ACTION_LABELS[log.action as AuditAction] ?? log.action}
                  </td>
                  <td className="py-3 px-4 text-ink-secondary">{log.targetLabel ?? "—"}</td>
                  <td className="py-3 px-4 text-ink-muted text-xs max-w-xs">{summarize(log.action, log.details)}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ink-muted">
                    Nenhum evento registrado ainda.
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
