"use client";

import { useRef, useState, type PointerEvent } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_INK } from "@/lib/chart-colors";
import { CONVERSATION_OUTCOMES, UNMARKED_COLOR, outcomeTotal } from "@/lib/whatsapp/outcome";
import type { OutcomeReport as Report } from "@/lib/whatsapp/outcome-report";

// Relatório "Resultado dos atendimentos" da tela de Métricas: o geral da loja
// (números, divisão e um gráfico por dia) e a comparação entre atendentes.
// Cada resultado tem sempre a mesma cor (lib/whatsapp/outcome.ts), igual aos
// botões da conversa, e todo número também aparece escrito — a cor não é o
// único jeito de ler.

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

// "2026-11-16" → "16/11", sem passar por new Date() (que leria em UTC).
function dayLabel(key: string) {
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

function Dot({ color }: { color: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden />;
}

function Legend({ withUnmarked = false }: { withUnmarked?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-secondary">
      {CONVERSATION_OUTCOMES.map((o) => (
        <span key={o.id} className="inline-flex items-center gap-1.5">
          <Dot color={o.color} /> {o.label}
        </span>
      ))}
      {withUnmarked && (
        <span className="inline-flex items-center gap-1.5">
          <Dot color={UNMARKED_COLOR} /> Sem marcação
        </span>
      )}
    </div>
  );
}

// Dica que segue o mouse (ou o toque) em cima das barras feitas em HTML.
function useHoverTip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const show = (text: string) => (e: PointerEvent) => {
    const el = box.current;
    if (!el) return;
    // + scroll: dentro da tabela que rola de lado no celular.
    const r = el.getBoundingClientRect();
    setTip({ x: e.clientX - r.left + el.scrollLeft, y: e.clientY - r.top + el.scrollTop, text });
  };
  const node = tip && (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full -mt-2 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink-primary shadow-lg"
      style={{ left: tip.x, top: tip.y - 8 }}
    >
      {tip.text}
    </div>
  );
  return { box, show, hide: () => setTip(null), node };
}

type Segment = { key: string; value: number; color: string; tip: string };

// Barra empilhada horizontal: cada pedaço do tamanho do número, 2px de
// respiro entre eles. width = quanto da trilha a barra inteira ocupa (100% no
// geral; proporcional ao maior atendente na tabela).
function StackedBar({
  segments,
  width = 100,
  height = "h-3",
  hover,
}: {
  segments: Segment[];
  width?: number;
  height?: string;
  hover: ReturnType<typeof useHoverTip>;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return <div className={`${height} rounded bg-surface-raised`} />;
  return (
    <div className={`${height} rounded bg-surface-raised`}>
      <div className="flex h-full gap-[2px]" style={{ width: `${Math.max(width, 2)}%` }}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.key}
              className="h-full rounded first:rounded-l last:rounded-r min-w-[3px] cursor-default"
              style={{ flexGrow: s.value, flexBasis: 0, backgroundColor: s.color }}
              onPointerEnter={hover.show(s.tip)}
              onPointerMove={hover.show(s.tip)}
              onPointerLeave={hover.hide}
            />
          ))}
      </div>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: { background: CHART_INK.surface, border: "1px solid #2E2A22", borderRadius: 8, fontSize: 12 },
  itemStyle: { color: CHART_INK.primary, padding: 0 },
  labelStyle: { color: CHART_INK.secondary, marginBottom: 4 },
  cursor: { fill: "rgba(247,243,234,0.05)" },
};

export function OutcomeReport({ report, singleDay }: { report: Report; singleDay: boolean }) {
  const { total, marked, unmarked, inProgress } = report;
  const summaryHover = useHoverTip();
  const agentHover = useHoverTip();
  const maxAgent = Math.max(...report.agents.map((a) => outcomeTotal(a.counts) + a.unmarked), 1);
  const nothing = marked + unmarked + inProgress === 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {CONVERSATION_OUTCOMES.map((o) => (
          <div key={o.id} className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2 mb-3 text-sm text-ink-secondary">
              <Dot color={o.color} /> {o.plural}
            </div>
            <div className="text-2xl font-semibold text-ink-primary tabular-nums">{total[o.id]}</div>
            <div className="text-xs text-ink-muted mt-1">
              {marked ? `${pct(total[o.id], marked)}% dos marcados` : "Nenhum marcado"}
            </div>
          </div>
        ))}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-3 text-sm text-ink-secondary">
            <Dot color={UNMARKED_COLOR} /> Sem marcação
          </div>
          <div className="text-2xl font-semibold text-ink-primary tabular-nums">{unmarked}</div>
          <div className="text-xs text-ink-muted mt-1">
            finalizado{unmarked === 1 ? "" : "s"} sem marcar · {inProgress} em andamento
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 space-y-5">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-sm font-semibold text-ink-primary">Com o que a loja está lidando</h3>
            <span className="text-xs text-ink-muted">
              {marked} atendimento{marked === 1 ? "" : "s"} marcado{marked === 1 ? "" : "s"}
            </span>
          </div>
          <div ref={summaryHover.box} className="relative">
            <StackedBar
              height="h-4"
              hover={summaryHover}
              segments={CONVERSATION_OUTCOMES.map((o) => ({
                key: o.id,
                value: total[o.id],
                color: o.color,
                tip: `${o.plural}: ${total[o.id]} (${pct(total[o.id], marked)}%)`,
              }))}
            />
            {summaryHover.node}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-secondary">
            {CONVERSATION_OUTCOMES.map((o) => (
              <span key={o.id} className="inline-flex items-center gap-1.5">
                <Dot color={o.color} /> {o.label}{" "}
                <span className="text-ink-primary font-medium tabular-nums">{pct(total[o.id], marked)}%</span>
              </span>
            ))}
          </div>
        </div>

        {!singleDay && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-sm font-semibold text-ink-primary">Por dia</h3>
              <Legend />
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={report.days.map((d) => ({ key: d.day, ...d.counts }))}
                margin={{ top: 8, right: 4, left: -16, bottom: 0 }}
              >
                <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
                <XAxis
                  dataKey="key"
                  tickFormatter={dayLabel}
                  tick={{ fill: CHART_INK.muted, fontSize: 11 }}
                  axisLine={{ stroke: CHART_INK.baseline }}
                  tickLine={false}
                  minTickGap={16}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: CHART_INK.muted, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(key: string) => dayLabel(key)}
                  formatter={(value: number, name: string) => [value, name]}
                />
                {CONVERSATION_OUTCOMES.map((o) => (
                  <Bar
                    key={o.id}
                    dataKey={o.id}
                    name={o.plural}
                    stackId="resultado"
                    fill={o.color}
                    stroke={CHART_INK.surface}
                    strokeWidth={1}
                    radius={2}
                    maxBarSize={28}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {nothing ? (
          <p className="text-sm text-ink-muted">Nenhum atendimento aberto no período.</p>
        ) : (
          !marked && (
            <p className="text-sm text-ink-muted">
              Ninguém marcou o resultado ainda. Os botões Venda, Orçamento e Informação ficam na conversa, logo
              embaixo do nome do cliente.
            </p>
          )
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-5 pt-5 pb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div>
            <h3 className="text-sm font-semibold text-ink-primary">Resultado por atendente</h3>
            <p className="text-xs text-ink-muted mt-0.5">Ordenado por vendas</p>
          </div>
          <Legend withUnmarked />
        </div>
        <div ref={agentHover.box} className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-y border-border bg-surface-raised/40 whitespace-nowrap">
                <th className="font-medium py-3 px-5">Atendente</th>
                <th className="font-medium py-3 px-4 min-w-[200px]">Resultados</th>
                {CONVERSATION_OUTCOMES.map((o) => (
                  <th key={o.id} className="font-medium py-3 px-4 text-right">
                    {o.plural}
                  </th>
                ))}
                <th className="font-medium py-3 px-4 text-right">Sem marcação</th>
                <th className="font-medium py-3 px-4 text-right" title="Vendas ÷ atendimentos marcados">
                  % de venda
                </th>
              </tr>
            </thead>
            <tbody>
              {report.agents.map((a, i) => {
                const agentMarked = outcomeTotal(a.counts);
                return (
                  <tr key={a.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 px-5 whitespace-nowrap">
                      <span className="inline-block w-5 text-ink-muted tabular-nums">{i + 1}.</span>
                      <span className="text-ink-primary font-medium">{a.name}</span>
                      {a.inProgress > 0 && (
                        <span className="block pl-5 text-xs text-ink-muted">{a.inProgress} em andamento</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <StackedBar
                        hover={agentHover}
                        width={((agentMarked + a.unmarked) / maxAgent) * 100}
                        segments={[
                          ...CONVERSATION_OUTCOMES.map((o) => ({
                            key: o.id,
                            value: a.counts[o.id],
                            color: o.color,
                            tip: `${a.name} · ${o.plural}: ${a.counts[o.id]}`,
                          })),
                          {
                            key: "sem",
                            value: a.unmarked,
                            color: UNMARKED_COLOR,
                            tip: `${a.name} · Sem marcação: ${a.unmarked}`,
                          },
                        ]}
                      />
                    </td>
                    {CONVERSATION_OUTCOMES.map((o) => (
                      <td
                        key={o.id}
                        className={`py-3 px-4 text-right tabular-nums ${
                          o.id === "VENDA" ? "text-ink-primary font-semibold" : "text-ink-secondary"
                        }`}
                      >
                        {a.counts[o.id]}
                      </td>
                    ))}
                    <td className="py-3 px-4 text-right tabular-nums text-ink-secondary">{a.unmarked}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-ink-secondary">
                      {agentMarked ? `${pct(a.counts.VENDA, agentMarked)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
              {report.agents.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-ink-muted">
                    Nenhum atendimento com atendente no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {agentHover.node}
        </div>
      </div>
    </div>
  );
}
