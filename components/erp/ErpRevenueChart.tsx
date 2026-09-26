"use client";

import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/format";
import { CHART_INK } from "@/lib/chart-colors";

type Point = { key: string; value: number };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Chaves já vêm prontas no fuso da loja ("YYYY-MM-DD" ou "YYYY-MM") — só
// quebrar a string, sem passar por new Date() (que reinterpretaria em UTC).
function label(key: string) {
  const [y, m, d] = key.split("-");
  return d ? `${d}/${m}` : `${MONTHS[Number(m) - 1]}/${y.slice(2)}`;
}

function axisMoney(value: number) {
  return value >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`;
}

const tooltipProps = {
  formatter: (value: number) => [formatCurrency(value), "Faturamento"] as [string, string],
  labelFormatter: (key: string) => label(key),
  contentStyle: { background: "#1A1712", border: "1px solid #2E2A22", borderRadius: 8, fontSize: 12 },
  itemStyle: { color: "#F7F3EA" },
  labelStyle: { color: "#C8BFA9", marginBottom: 4 },
  cursor: { fill: "rgba(212,175,55,0.08)" },
};

// Por dia = área (tendência); por mês = barras (cada mês é um total fechado).
export function ErpRevenueChart({ data, granularity }: { data: Point[]; granularity: "day" | "month" }) {
  const xAxis = (
    <XAxis
      dataKey="key"
      tickFormatter={label}
      tick={{ fill: CHART_INK.muted, fontSize: 11 }}
      axisLine={{ stroke: CHART_INK.baseline }}
      tickLine={false}
      minTickGap={20}
    />
  );
  const yAxis = (
    <YAxis tick={{ fill: CHART_INK.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={axisMoney} />
  );

  return (
    <ResponsiveContainer width="100%" height={240}>
      {granularity === "month" ? (
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
          {xAxis}
          {yAxis}
          <Tooltip {...tooltipProps} />
          <Bar dataKey="value" fill="#D4AF37" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      ) : (
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="erpGoldFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
          {xAxis}
          {yAxis}
          <Tooltip {...tooltipProps} cursor={{ stroke: CHART_INK.baseline }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#D4AF37"
            strokeWidth={2}
            fill="url(#erpGoldFill)"
            dot={false}
            activeDot={{ r: 4, fill: "#D4AF37", stroke: "#1A1712", strokeWidth: 2 }}
          />
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}
