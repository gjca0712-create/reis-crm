"use client";

import { useEffect } from "react";
import { AlertOctagon } from "lucide-react";

const RELOAD_GUARD_KEY = "crm-stale-bundle-reload-at";

// Mensagem padrão do Next quando uma aba ficou aberta desde antes de um
// deploy: o JS em memória é de uma versão antiga e o servidor atual não
// reconhece mais aquela ação. reset() não resolve (o bundle antigo continua
// carregado) — só um reload de verdade busca o HTML/JS novo. A guarda por
// timestamp evita loop caso o erro volte por outro motivo.
function isStaleBundleError(message: string) {
  return /unexpected response was received from the server/i.test(message);
}

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const staleBundle = isStaleBundleError(error.message || "");

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    if (!staleBundle) return;
    const lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (Date.now() - lastReload < 10000) return;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    window.location.reload();
  }, [staleBundle]);

  if (staleBundle) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-page">
        <p className="text-sm text-ink-muted">Atualizando para a versão mais recente do sistema…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-page">
      <div className="max-w-sm text-center">
        <AlertOctagon className="w-10 h-10 text-status-critical mx-auto mb-4" />
        <h1 className="text-lg font-semibold text-ink-primary mb-2">Algo deu errado</h1>
        <p className="text-sm text-ink-muted mb-6">{error.message || "Ocorreu um erro inesperado."}</p>
        <button
          onClick={reset}
          className="rounded-lg bg-gold-400 text-page font-semibold px-5 py-2.5 text-sm hover:bg-gold-300 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
