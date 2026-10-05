"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Bolinha verde com o número de mensagens não lidas do chat interno, no item
// do menu. Consulta a cada 20s e sempre que a pessoa muda de tela (ao abrir o
// chat, o que foi lido some do contador).
export function TeamChatBadge() {
  const pathname = usePathname();
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/chat-interno/nao-lidas", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { total: 0 }))
        .then((d: { total?: number }) => alive && setTotal(d.total ?? 0))
        .catch(() => {});
    load();
    const id = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pathname]);

  if (!total) return null;
  return (
    <span className="ml-auto min-w-[20px] rounded-full bg-wa-green px-1.5 text-center text-[11px] font-semibold leading-5 text-wa-bg">
      {total > 99 ? "99+" : total}
    </span>
  );
}
