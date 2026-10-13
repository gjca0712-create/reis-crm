"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ListFilter, Loader2, Search, X, XCircle } from "lucide-react";
import {
  ARCHIVE_ORDERS,
  ARCHIVE_STATUSES,
  DEFAULT_ARCHIVE_FILTERS,
  archiveQuery,
  hasActiveFilters,
  type ArchiveFilters as Filters,
} from "@/lib/whatsapp/archive";

type Option = { id: string; label: string };
type Menu = "sectors" | "agents" | "lines" | null;

// Topo da lista de Mensagens antigas: busca nas mensagens, título com a
// situação escolhida, botão de limpar e o painel de filtros (cada mudança já
// aplica, igual ao painel de atendimentos que a loja usava).
export function ArchiveFilters({
  filters,
  sectors,
  agents,
  lines,
}: {
  filters: Filters;
  sectors: Option[];
  agents: Option[];
  lines: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(filters);
  const [q, setQ] = useState(filters.q);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<Menu>(null);
  const box = useRef<HTMLDivElement>(null);

  // A página volta do servidor com os filtros aplicados (ou outros, pelo voltar do navegador).
  useEffect(() => {
    setCurrent(filters);
    setQ(filters.q);
  }, [filters]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        setOpen(false);
        setMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setMenu(null);
      }
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
    setCurrent(next);
    startTransition(() => router.replace(archiveQuery(next), { scroll: false }));
  };

  const title = ARCHIVE_STATUSES.find((s) => s.id === current.status)?.label ?? "Finalizados";

  return (
    <div className="px-3 pt-3 pb-2.5 border-b border-wa-border bg-wa-list rounded-t-2xl">
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

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-medium text-wa-text">
          {title}
          {pending && <Loader2 className="w-4 h-4 animate-spin text-wa-muted" aria-label="Carregando" />}
        </h2>
        <div ref={box} className="relative flex items-center gap-1.5">
          {hasActiveFilters(current) && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setMenu(null);
                apply(DEFAULT_ARCHIVE_FILTERS);
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

          {open && (
            <div className="absolute right-0 top-10 z-30 w-[330px] max-w-[calc(100vw-48px)] rounded-xl border border-wa-border bg-wa-panel shadow-2xl p-4 space-y-3">
              <Row label="Situação">
                <Select
                  label="Situação"
                  value={current.status}
                  options={ARCHIVE_STATUSES}
                  onChange={(v) => apply({ status: v as Filters["status"] })}
                />
              </Row>
              <Row label="Ordenar por">
                <Select
                  label="Ordenar por"
                  value={current.order}
                  options={ARCHIVE_ORDERS}
                  onChange={(v) => apply({ order: v as Filters["order"] })}
                />
              </Row>
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
            </div>
          )}
        </div>
      </div>
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
