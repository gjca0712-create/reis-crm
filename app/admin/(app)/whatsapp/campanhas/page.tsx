import { Plus, Send } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { SEGMENT_LABELS } from "@/lib/campaigns";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { requireFeature } from "@/lib/session";
import { AutoRefresh } from "@/components/whatsapp/AutoRefresh";
import { sendCampaign } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  ENVIADA: "Enviada",
  ENVIANDO: "Enviando…",
  AGENDADA: "Agendada",
  RASCUNHO: "Rascunho",
};

export default async function CampanhasPage() {
  await requireFeature("whatsapp_campanhas");

  const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: "desc" } });
  const hasSending = campaigns.some((c) => c.status === "ENVIANDO");

  return (
    <div className="space-y-6">
      {hasSending && <AutoRefresh intervalMs={3000} />}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">WhatsApp Campanhas</h1>
          <p className="text-sm text-ink-muted mt-0.5">Disparos em massa pela mesma conexão do WhatsApp Suporte</p>
        </div>
        <LinkButton href="/admin/whatsapp/campanhas/nova">
          <Plus className="w-4 h-4" /> Nova campanha
        </LinkButton>
      </div>

      <div className="rounded-lg border border-gold-700/30 bg-gold-400/5 px-4 py-3 text-xs text-ink-secondary">
        O envio usa a Linha 1 do WhatsApp (a mesma do Suporte) — precisa estar conectada. Não é a API comercial
        oficial da Meta, então mensagens saem uma a uma, espaçadas, pra reduzir o risco de bloqueio do número. Evite
        disparar pra públicos muito grandes de uma vez.
      </div>

      <div className="space-y-3">
        {campaigns.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-ink-primary">{c.name}</h3>
                  <Badge
                    status={
                      c.status === "ENVIADA" ? "good" : c.status === "ENVIANDO" || c.status === "AGENDADA" ? "warning" : "neutral"
                    }
                  >
                    {STATUS_LABEL[c.status] ?? c.status}
                  </Badge>
                </div>
                <p className="text-sm text-ink-secondary mt-1.5">{c.message}</p>
                <p className="text-xs text-ink-muted mt-2">
                  Segmento: {SEGMENT_LABELS[c.segment] ?? c.segment} · {c.audienceSize} destinatário
                  {c.audienceSize === 1 ? "" : "s"}
                  {c.status === "ENVIANDO" && ` · ${c.sentCount} enviada${c.sentCount === 1 ? "" : "s"} até agora`}
                  {c.sentAt ? ` · Concluída em ${formatDateTime(c.sentAt)} (${c.sentCount} entregues)` : ""}
                </p>
              </div>
              {c.status !== "ENVIADA" && c.status !== "ENVIANDO" && (
                <form action={sendCampaign.bind(null, c.id)}>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-lg bg-gold-400 text-page font-semibold px-4 py-2 text-sm hover:bg-gold-300 transition-colors shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" /> Disparar
                  </button>
                </form>
              )}
            </div>
          </Card>
        ))}
        {campaigns.length === 0 && (
          <Card>
            <p className="text-sm text-ink-muted">Nenhuma campanha criada ainda.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
