"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Filtro de um dia só da seção "Resultado dos atendimentos" (whatsapp/metricas).
// Mexe só no ?dia= e mantém o ?periodo= do topo, que continua valendo pro
// resto da tela. Sem dia = o período todo.

const chip = (active: boolean) =>
  `inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
    active
      ? "border-gold-400/40 bg-gold-400/15 text-gold-400"
      : "border-border bg-surface text-ink-secondary hover:text-ink-primary"
  }`;

export function OutcomeDayFilter({
  period,
  day,
  today,
  yesterday,
}: {
  period: string;
  day: string | null;
  today: string;
  yesterday: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const href = (d?: string) => `?periodo=${period}${d ? `&dia=${d}` : ""}`;
  const otherDay = day !== null && day !== today && day !== yesterday;

  return (
    <div role="group" aria-label="Dia" className="flex flex-wrap items-center gap-1.5">
      <Link href={href()} scroll={false} aria-current={day === null ? "page" : undefined} className={chip(day === null)}>
        Período todo
      </Link>
      <Link href={href(today)} scroll={false} aria-current={day === today ? "page" : undefined} className={chip(day === today)}>
        Hoje
      </Link>
      <Link
        href={href(yesterday)}
        scroll={false}
        aria-current={day === yesterday ? "page" : undefined}
        className={chip(day === yesterday)}
      >
        Ontem
      </Link>
      <input
        // key: volta a mostrar o dia escolhido quando ele muda por um dos botões.
        key={day ?? "todos"}
        type="date"
        min="2020-01-01"
        max={today}
        defaultValue={day ?? ""}
        aria-label="Escolher um dia"
        title="Escolher um dia"
        // Digitando o ano, o campo passa por 0002, 0020…: só navega com o ano já completo.
        onChange={(e) => {
          const v = e.target.value;
          if (v >= "2020-01-01" && v <= today) startTransition(() => router.push(href(v), { scroll: false }));
        }}
        className={`${chip(otherDay)} cursor-pointer tabular-nums focus:outline-none focus:ring-2 focus:ring-gold-400/50 ${
          pending ? "opacity-60" : ""
        }`}
      />
    </div>
  );
}
