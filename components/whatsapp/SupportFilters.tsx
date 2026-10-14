"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, ListFilter, Loader2, Search, X, XCircle } from "lucide-react";
import {
  DEFAULT_SUPPORT_FILTERS,
  SUPPORT_STATUSES,
  hasActiveFilters,
  ordersFor,
  parseSupportFiltersCookie,
  supportFiltersQuery,
  type SupportFilters as Filters,
} from "@/lib/whatsapp/filters";

type Option = { id: string; label: string };
type Menu = "sectors" | "agents" | "lines" | null;

// Topo da coluna da fila do Suporte, embutido nela como no painel de
// atendimentos que a loja usava: busca nas mensagens, título com a situação
// escolhida (e o total), botão de limpar e o painel de filtros (cada mudança
// já aplica). A escolha vai pro cookie pela action save, que atualiza a tela
// no lugar.
// canSeeFinished: CEO/Gerente — mostra "Situação" (Em aberto | Finalizados).
// agentFilter: onde o filtro de atendente vale ("finalizados" = só lá).
// fromUrl: os filtros vieram de um link — grava no cookie e limpa a URL.
// children: faixa embaixo do título (as abas da fila, na página).
export function SupportFilters({
  filters,
  canSeeFinished,
  agentFilter,
  sectors,
  agents,
  lines,
  count,
  fromUrl = false,
  save,
  children,
}: {
  filters: Filters;
  canSeeFinished: boolean;
  agentFilter: "always" | "finalizados" | "never";
  sectors: Option[];
  agents: Option[];
  lines: Option[];
  count?: number;
  fromUrl?: boolean;
  save: (query: string) => Promise<void>;
  children?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(filters);
  const [q, setQ] = useState(filters.q);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<Menu>(null);
  const box = useRef<HTMLDivElement>(null);
  const persisted = useRef(false);

  // A página volta do servidor com os filtros aplicados. Pela query string, e
  // não pelo objeto: a atualização automática (12s) manda um objeto novo igual
  // e apagaria o que a pessoa está digitando na busca.
  const filtersKey = supportFiltersQuery(filters);
  useEffect(() => {
    const f = parseSupportFiltersCookie(filtersKey);
    setCurrent(f);
    setQ(f.q);
  }, [filtersKey]);

  // Grava e, se a URL tinha o que não vale mais, limpa: trocando de situação
  // saem a página e a conversa aberta (eram da outra lista); senão só a página
  // e os filtros que vieram num link.
  const persist = (query: string, statusChanged: boolean) =>
    startTransition(async () => {
      await save(query);
      const c = statusChanged ? null : searchParams.get("c");
      const target = c ? `${pathname}?c=${encodeURIComponent(c)}` : pathname;
      const now = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
      if (target !== now) router.replace(target, { scroll: false });
    });

  useEffect(() => {
    if (!fromUrl || persisted.current) return;
    persisted.current = true;
    persist(supportFiltersQuery(filters), false);
  });

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      setMenu(null);
    };
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const apply = (changes: Partial<Filters>) => {
    const next = { ...current, ...changes };
    if (!ordersFor(next.status).some((o) => o.id === next.order)) next.order = DEFAULT_SUPPORT_FILTERS.order;
    if (agentFilter === "finalizados" && next.status !== "finalizados") next.agents = [];
    setCurrent(next);
    persist(supportFiltersQuery(next), next.status !== current.status);
  };

  const title = SUPPORT_STATUSES.find((s) => s.id === current.status)?.label ?? "Em aberto";
  const showAgents = agentFilter === "always" || (agentFilter === "finalizados" && current.status === "finalizados");

  return (
    <div ref={box} className="shrink-0 border-b border-wa-border px-3 pt-3 pb-2.5">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q: q.trim() });
        }}
        className="relative"
      >
        <Search className="w-4 h-4 text-wa-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Procurar por mensagens nas conversas"
          aria-label="Procurar por nome, telefone, número ou texto das mensagens"
          className="w-full rounded-lg bg-wa-panel border border-wa-border pl-9 pr-8 py-2 text-sm text-wa-text placeholder:text-wa-muted focus:outline-none focus:ring-2 focus:ring-wa-green/40"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              apply({ q: "" });
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-wa-muted hover:text-wa-text"
            aria-label="Limpar busca"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </form>

      <div className="relative mt-2.5 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-medium text-wa-text">
          {title}
          {count !== undefined && (
            <span className="min-w-[22px] rounded-full bg-wa-active px-1.5 text-center text-xs font-semibold leading-[22px] text-wa-muted tabular-nums">
              {count}
            </span>
          )}
          {pending && <Loader2 className="w-4 h-4 animate-spin text-wa-muted" aria-label="Carregando" />}
        </h2>
        <div className="flex items-center gap-1.5">
          {hasActiveFilters(current) && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setMenu(null);
                apply(DEFAULT_SUPPORT_FILTERS);
              }}
              title="Limpar filtros"
              aria-label="Limpar filtros"
              className="w-8 h-8 rounded-lg bg-[rgb(244,63,94)]/20 text-[rgb(244,63,94)] flex items-center justify-center hover:bg-[rgb(244,63,94)]/30"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen((o) => !o);
              setMenu(null);
            }}
            aria-expanded={open}
            title="Filtros"
            aria-label="Filtros"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              open ? "bg-wa-green text-wa-bg" : "bg-wa-green/85 text-wa-bg hover:bg-wa-green"
            }`}
          >
            <ListFilter className="w-4 h-4" />
          </button>
        </div>

        {open && (
          <div className="absolute right-0 top-full mt-1.5 z-30 w-[330px] max-w-full rounded-xl border border-wa-border bg-wa-panel shadow-2xl p-4 space-y-3">
            {canSeeFinished && (
              <Row label="Situação">
                <Select
                  label="Situação"
                  value={current.status}
                  options={SUPPORT_STATUSES}
                  onChange={(v) => apply({ status: v as Filters["status"] })}
                />
              </Row>
            )}
            <Row label="Ordenar por">
              <Select
                label="Ordenar por"
                value={current.order}
                options={ordersFor(current.status)}
                onChange={(v) => apply({ order: v as Filters["order"] })}
              />
            </Row>
            {sectors.length > 1 && (
              <Row label="Departamentos">
                <MultiSelect
                  label="Departamentos"
                  options={sectors}
                  value={current.sectors}
                  open={menu === "sectors"}
                  onToggle={() => setMenu(menu === "sectors" ? null : "sectors")}
                  onChange={(v) => apply({ sectors: v.length === sectors.length ? [] : v })}
                />
              </Row>
            )}
            {showAgents && agents.length > 0 && (
              <Row label="Atendentes">
                <MultiSelect
                  label="Atendentes"
                  options={agents}
                  value={current.agents}
                  open={menu === "agents"}
                  onToggle={() => setMenu(menu === "agents" ? null : "agents")}
                  onChange={(v) => apply({ agents: v.length === agents.length ? [] : v })}
                />
              </Row>
            )}
            <Row label="Caixas de entrada">
              <MultiSelect
                label="Caixas de entrada"
                options={lines}
                value={current.lines}
                open={menu === "lines"}
                onToggle={() => setMenu(menu === "lines" ? null : "lines")}
                onChange={(v) => apply({ lines: v.length === lines.length ? [] : v })}
              />
            </Row>
            {current.order === "chegada" && (
              <p className="text-[11px] leading-snug text-wa-muted">
                Quem espera resposta há mais tempo fica em cima; as já respondidas vêm depois.
              </p>
            )}
          </div>
        )}
      </div>

      {children && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[124px_minmax(0,1fr)] items-center gap-3">
      <span className="text-sm text-wa-text whitespace-nowrap">{label}</span>
      {children}
    </div>
  );
}

const fieldClass =
  "w-full rounded-md bg-wa-active border border-wa-border px-2.5 py-1.5 text-sm text-wa-text focus:outline-none focus:ring-2 focus:ring-wa-green/40";

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Vários marcados: "Todos" quando nenhum (= sem filtro), o nome quando é um, "3 selecionados".
function MultiSelect({
  label,
  options,
  value,
  open,
  onToggle,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string[];
  open: boolean;
  onToggle: () => void;
  onChange: (v: string[]) => void;
}) {
  const summary =
    value.length === 0
      ? "Todos"
      : value.length === 1
        ? (options.find((o) => o.id === value[0])?.label ?? "1 selecionado")
        : `${value.length} selecionados`;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${label}: ${summary}`}
        className={`${fieldClass} flex items-center justify-between gap-2 text-left`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-wa-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 left-0 top-full mt-1 z-40 max-h-60 overflow-y-auto rounded-md border border-wa-border bg-wa-bg shadow-xl py-1">
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-wa-text hover:bg-wa-panel"
          >
            <CheckMark on={value.length === 0} /> Todos
          </button>
          {options.map((o) => {
            const on = value.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-wa-text hover:bg-wa-panel text-left"
              >
                <CheckMark on={on} /> <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CheckMark({ on }: { on: boolean }) {
  return (
    <span
      className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
        on ? "bg-wa-green border-wa-green text-wa-bg" : "border-wa-muted/60"
      }`}
    >
      {on && <Check className="w-3 h-3" strokeWidth={3} />}
    </span>
  );
}
