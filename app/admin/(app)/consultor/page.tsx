import Link from "next/link";
import { Plus, MessageSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { getErpDataStatus } from "@/lib/erp/queries";
import { MAX_PERGUNTAS_POR_CONVERSA } from "@/lib/consultor/config";
import { getConsultorRegras } from "@/lib/consultor/settings";
import { inicioDeHoje, inicioDoMes } from "@/lib/consultor/periodo";
import type { ConsultaFeita } from "@/lib/consultor/ferramentas";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { ConsultorChat, type MensagemConsultor } from "@/components/consultor/ConsultorChat";
import { RegrasForm } from "@/components/consultor/RegrasForm";

const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

// Consultor IA: conversa com a IA sobre os números da loja — só CEO e Gerente.
// Cada usuário vê só as próprias conversas.
export default async function ConsultorPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const session = await requireFeature("consultor");
  const { c } = await searchParams;
  const isCeo = session.role === "CEO";

  const [regras, conversas, conversa, perguntasHoje, gastoMes, avaliacoes, erp] = await Promise.all([
    getConsultorRegras(),
    prisma.consultorConversation.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: { id: true, title: true, updatedAt: true },
    }),
    c
      ? prisma.consultorConversation.findFirst({
          where: { id: c, userId: session.userId },
          select: {
            id: true,
            messages: { orderBy: { createdAt: "asc" }, select: { id: true, role: true, text: true, tools: true, feedback: true } },
          },
        })
      : null,
    prisma.consultorMessage.count({
      where: { role: "user", createdAt: { gte: inicioDeHoje() }, conversation: { userId: session.userId } },
    }),
    prisma.consultorMessage.aggregate({ where: { createdAt: { gte: inicioDoMes() } }, _sum: { costUsd: true } }),
    prisma.consultorMessage.groupBy({
      by: ["feedback"],
      where: { createdAt: { gte: inicioDoMes() }, feedback: { not: null } },
      _count: { _all: true },
    }),
    getErpDataStatus(),
  ]);

  const mensagens: MensagemConsultor[] = (conversa?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role === "assistant" ? "assistant" : "user",
    text: m.text,
    consultas: Array.isArray(m.tools) ? (m.tools as unknown as ConsultaFeita[]) : [],
    feedback: m.feedback,
  }));
  const perguntasNaConversa = mensagens.filter((m) => m.role === "user").length;

  const semChave = !process.env.ANTHROPIC_API_KEY;
  const bloqueio = semChave
    ? "A IA ainda não foi ligada: falta configurar a chave da Anthropic (ANTHROPIC_API_KEY) no servidor."
    : perguntasHoje >= regras.limiteDiario
      ? `Você chegou ao limite de ${regras.limiteDiario} perguntas de hoje. Amanhã libera de novo.`
      : perguntasNaConversa >= MAX_PERGUNTAS_POR_CONVERSA
        ? "Esta conversa chegou ao limite de perguntas. Comece uma nova: as respostas saem mais certas."
        : null;

  const gasto = Number(gastoMes._sum.costUsd ?? 0);
  const positivas = avaliacoes.find((a) => a.feedback === 1)?._count._all ?? 0;
  const negativas = avaliacoes.find((a) => a.feedback === -1)?._count._all ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Consultor IA</h1>
          <p className="text-sm text-ink-muted mt-0.5">Análises e sugestões de ofertas com os números do ERP e do CRM</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {erp.mode === "demo" && <Badge status="warning">ERP em demonstração</Badge>}
          {erp.mode === "empty" && <Badge status="warning">ERP ainda sem dados</Badge>}
          {semChave && <Badge status="critical">IA desligada</Badge>}
          <Badge>
            {perguntasHoje} de {regras.limiteDiario} perguntas hoje
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-4 order-2 lg:order-1">
          <Card className="p-3">
            <LinkButton href="/admin/consultor" variant="secondary" className="w-full">
              <Plus className="w-4 h-4" />
              Nova conversa
            </LinkButton>
            {conversas.length > 0 && (
              <ul className="mt-3 max-h-80 overflow-y-auto space-y-0.5">
                {conversas.map((cv) => (
                  <li key={cv.id}>
                    <Link
                      href={`/admin/consultor?c=${cv.id}`}
                      className={cn(
                        "flex items-start gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        cv.id === conversa?.id
                          ? "bg-surface-raised text-ink-primary"
                          : "text-ink-secondary hover:bg-surface-raised hover:text-ink-primary"
                      )}
                    >
                      <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-ink-muted" />
                      <span className="min-w-0">
                        <span className="block truncate">{cv.title}</span>
                        <span className="block text-[11px] text-ink-muted">{formatDate(cv.updatedAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Uso no mês" subtitle="Toda a equipe">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Custo da IA</dt>
                <dd className="text-ink-primary tabular-nums">{usd.format(gasto)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Respostas boas / ruins</dt>
                <dd className="text-ink-primary tabular-nums">
                  {positivas} / {negativas}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Regras das ofertas" subtitle="A IA nunca sugere nada fora delas">
            <details open={isCeo && !regras.updatedAt}>
              <summary className="cursor-pointer select-none text-sm text-ink-secondary hover:text-ink-primary">
                Margem mínima {regras.margemMinima}% · desconto máximo {regras.descontoMaximo}%
              </summary>
              <div className="mt-3">
                <RegrasForm
                  regras={{
                    margemMinima: regras.margemMinima,
                    descontoMaximo: regras.descontoMaximo,
                    limiteDiario: regras.limiteDiario,
                    sobreEmpresa: regras.sobreEmpresa,
                  }}
                  podeEditar={isCeo}
                />
                {regras.updatedAt && (
                  <p className="mt-2 text-[11px] text-ink-muted">
                    Alterado em {formatDate(regras.updatedAt)}
                    {regras.updatedBy ? ` por ${regras.updatedBy}` : ""}
                  </p>
                )}
              </div>
            </details>
          </Card>
        </div>

        <div className="order-1 lg:order-2 min-w-0">
          {c && !conversa ? (
            <Card>
              <p className="text-sm text-ink-secondary">Conversa não encontrada.</p>
            </Card>
          ) : (
            <ConsultorChat key={conversa?.id ?? "nova"} conversaId={conversa?.id ?? null} mensagensIniciais={mensagens} bloqueio={bloqueio} />
          )}
        </div>
      </div>
    </div>
  );
}
