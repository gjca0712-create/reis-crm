import { Plus, Send } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { requireFeature } from "@/lib/session";
import { sendCampaign } from "./actions";

export default async function CampanhasPage() {
  await requireFeature("whatsapp_campanhas");

  const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">WhatsApp Campanhas</h1>
          <p className="text-sm text-ink-muted mt-0.5">Disparos em massa via API oficial do WhatsApp Business</p>
        </div>
        <LinkButton href="/admin/whatsapp/campanhas/nova">
          <Plus className="w-4 h-4" /> Nova campanha
        </LinkButton>
      </div>

      <div className="rounded-lg border border-gold-700/30 bg-gold-400/5 px-4 py-3 text-xs text-ink-secondary">
        Para disparar mensagens de verdade, conecte um número comercial na Meta Cloud API (WhatsApp Business
        Platform) com token de acesso e templates aprovados. Por enquanto, campanhas ficam registradas aqui e o
        envio é simulado.
      </div>

      <div className="space-y-3">
        {campaigns.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-ink-primary">{c.name}</h3>
                  <Badge status={c.status === "ENVIADA" ? "good" : c.status === "AGENDADA" ? "warning" : "neutral"}>
                    {c.status === "ENVIADA" ? "Enviada" : c.status === "AGENDADA" ? "Agendada" : "Rascunho"}
                  </Badge>
                </div>
                <p className="text-sm text-ink-secondary mt-1.5">{c.message}</p>
                <p className="text-xs text-ink-muted mt-2">
                  Segmento: {c.segment} · {c.audienceSize} destinatário{c.audienceSize === 1 ? "" : "s"}
                  {c.sentAt ? ` · Enviada em ${formatDateTime(c.sentAt)}` : ""}
                </p>
              </div>
              {c.status !== "ENVIADA" && (
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
