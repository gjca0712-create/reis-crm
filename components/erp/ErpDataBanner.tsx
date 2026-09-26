import { Database, FlaskConical, RefreshCw, AlertTriangle } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { ErpDataMode } from "@/lib/erp/queries";
import { loadDemoDataAction, clearDemoDataAction } from "@/app/admin/(app)/financeiro/actions";
import { PendingButton } from "./PendingButton";

// Programa da loja manda dados a cada poucos minutos — passou disso, provavelmente parou
// (computador do ERP desligado, sem internet...).
const STALE_AFTER_MINUTES = 30;

function minutesSince(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / 60_000);
}

function ago(minutes: number) {
  if (minutes < 1) return "agora há pouco";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days === 1 ? "" : "s"}`;
}

// De onde vêm os números da tela: ainda nada, demonstração, ou o ERP de verdade.
export function ErpDataBanner({
  mode,
  lastSyncAt,
  isCeo,
}: {
  mode: ErpDataMode;
  lastSyncAt: Date | null;
  isCeo: boolean;
}) {
  if (mode === "empty") {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 flex flex-col items-center text-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-gold-400/10 flex items-center justify-center">
          <Database className="w-5 h-5 text-gold-400" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-ink-primary">Ainda não conectado ao ERP</h2>
          <p className="text-sm text-ink-muted mt-1 max-w-lg">
            Esta tela mostra os números do sistema da loja (faturamento, margem, contas a pagar e a receber, estoque)
            assim que o programa de sincronização for instalado no computador do ERP.
          </p>
        </div>
        {isCeo ? (
          <form action={loadDemoDataAction}>
            <PendingButton
              pendingText="Gerando dados de demonstração…"
              className="rounded-lg bg-gold-400 text-page font-semibold px-4 py-2.5 text-sm hover:bg-gold-300 transition-colors"
            >
              Carregar dados de demonstração
            </PendingButton>
          </form>
        ) : (
          <p className="text-xs text-ink-muted">O CEO pode carregar dados de demonstração pra visualizar as telas.</p>
        )}
      </div>
    );
  }

  if (mode === "demo") {
    return (
      <div className="rounded-xl border border-status-warning/30 bg-status-warning/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5 text-sm text-status-warning">
          <FlaskConical className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Dados de demonstração</strong> — números fictícios, só pra visualizar as telas. Somem sozinhos
            quando o ERP da loja for conectado.
          </span>
        </div>
        {isCeo && (
          <form action={clearDemoDataAction}>
            <PendingButton pendingText="Apagando…" className="text-xs text-status-warning hover:underline">
              Apagar demonstração
            </PendingButton>
          </form>
        )}
      </div>
    );
  }

  const minutes = lastSyncAt ? minutesSince(lastSyncAt) : null;
  const stale = minutes == null || minutes > STALE_AFTER_MINUTES;
  return (
    <div
      className={`flex items-center gap-2 text-xs ${stale ? "text-status-warning" : "text-ink-muted"}`}
      title={lastSyncAt ? `Última sincronização: ${formatDateTime(lastSyncAt)}` : undefined}
    >
      {stale ? <AlertTriangle className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
      {minutes == null
        ? "Sem registro de sincronização com o ERP."
        : stale
          ? `Última atualização com o ERP ${ago(minutes)} — o programa da loja pode estar parado (computador do ERP desligado ou sem internet).`
          : `Atualizado com o ERP ${ago(minutes)}.`}
    </div>
  );
}
