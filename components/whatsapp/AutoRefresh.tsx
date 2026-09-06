"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Fica atualizando a página em Server Component enquanto o QR aguarda leitura,
// pra detectar quando a conexão fecha (status muda pra "connected") sem precisar
// de F5 manual.
export function AutoRefresh({ intervalMs = 2500 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
