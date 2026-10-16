"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Atualiza a tela do Suporte quase na hora: pergunta a versão a cada 2 s
// (resposta minúscula, ver lib/whatsapp/live.ts) e só recarrega quando ela
// muda — mensagem nova, colega que assumiu ou transferiu, linha que caiu.
// version: a versão com que a página foi montada no servidor — depois de uma
// ação da própria pessoa a tela já volta atualizada, sem recarregar de novo.
// fallbackMs: recarrega de qualquer jeito de tempos em tempos (o que muda só
// com o relógio, tipo "sem resposta há +4h"). Aba escondida não pergunta;
// voltando pra ela, pergunta na hora.
export function LiveRefresh({
  url,
  version,
  pollMs = 2000,
  fallbackMs = 30000,
}: {
  url: string;
  version: string;
  pollMs?: number;
  fallbackMs?: number;
}) {
  const router = useRouter();
  const seen = useRef(version);
  const lastRefresh = useRef(Date.now());

  useEffect(() => {
    seen.current = version;
    lastRefresh.current = Date.now();
  }, [version]);

  useEffect(() => {
    let busy = false;
    let stopped = false;

    function refresh() {
      lastRefresh.current = Date.now();
      router.refresh();
    }

    async function check() {
      if (busy || stopped || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) {
          const { v } = (await res.json()) as { v: string };
          if (v !== seen.current) {
            seen.current = v;
            refresh();
          }
        }
      } catch {
        // sem internet por um instante: tenta de novo no próximo
      } finally {
        busy = false;
      }
      if (Date.now() - lastRefresh.current >= fallbackMs) refresh();
    }

    void check();
    const id = window.setInterval(() => void check(), pollMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, url, pollMs, fallbackMs]);

  return null;
}
