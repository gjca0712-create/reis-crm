"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/format";
import { CHART_INK } from "@/lib/chart-colors";

type Point = { date: string; value: number };

// data[].date is a plain "yyyy-mm-dd" key (see lib/dates.ts) — split it directly
// rather than re-parsing through `new Date()`, which would round-trip via UTC.
function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function RevenueTrendChart({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={{ fill: CHART_INK.muted, fontSize: 11 }}
          axisLine={{ stroke: CHART_INK.baseline }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: CHART_INK.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={(value: number) => (value >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`)}
        />
        <Tooltip
          formatter={(value: number) => [formatCurrency(value), "Receita"]}
          labelFormatter={(label: string) => shortDate(label)}
          contentStyle={{
            background: "#1A1712",
            border: "1px solid #2E2A22",
            borderRadius: 8,
            fontSize: 12,
          }}
          itemStyle={{ color: "#F7F3EA" }}
          labelStyle={{ color: "#C8BFA9", marginBottom: 4 }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#D4AF37"
          strokeWidth={2}
          fill="url(#goldFill)"
          dot={false}
          activeDot={{ r: 4, fill: "#D4AF37", stroke: "#1A1712", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
