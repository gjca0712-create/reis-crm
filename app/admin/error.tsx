"use client";

import { useEffect } from "react";
import { AlertOctagon } from "lucide-react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
