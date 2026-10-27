"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { brlExact, compactBrl } from "@/lib/format";
import type { FinancialTimelinePoint } from "@/lib/finance";

type Props = {
  points: FinancialTimelinePoint[];
  height?: number;
  onPointClick?: (date: string, metric: "revenue" | "costs" | "result") => void;
};

type TrendDatum = {
  date: string;
  label: string;
  revenue: number;
  costs: number;
  result: number;
  count: number;
};

type MetricKey = "revenue" | "costs" | "result";

const METRICS: Array<{ key: MetricKey; label: string; color: string }> = [
  { key: "revenue", label: "Receita", color: "#2f7df6" },
  { key: "costs", label: "Custos", color: "#e95469" },
  { key: "result", label: "Resultado", color: "#14b87a" },
];

function FinancialTooltip({
  active,
  label,
  payload,
  metric,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ dataKey?: string; value?: number }>;
  metric: (typeof METRICS)[number];
}) {
  if (!active || !payload?.length) return null;

  const value = Number(payload[0]?.value ?? 0);

  return (
    <div className="financial-trend-tooltip">
      <strong>{label}</strong>
      <span>
        <i style={{ background: metric.color }} />
        {metric.label}
        <b>{brlExact(value)}</b>
      </span>
    </div>
  );
}

/** Curva diária no estilo da referência, com uma métrica por vez. */
export function LineCharts9({ points, height = 250, onPointClick }: Props) {
  const [selectedKey, setSelectedKey] = useState<MetricKey>("revenue");
  const metric = METRICS.find((item) => item.key === selectedKey) ?? METRICS[0];
  const data: TrendDatum[] = points.map((point) => ({
    date: point.date,
    label: point.label,
    revenue: point.income,
    costs: point.expense,
    result: point.profit,
    count: point.count,
  }));
  const tickInterval = Math.max(0, Math.ceil(data.length / 7) - 1);
  const values = data.map((point) => point[selectedKey]);
  const high = Math.max(...values);
  const low = Math.min(...values);
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  const change = first === 0 ? null : ((last - first) / Math.abs(first)) * 100;

  return (
    <div className="financial-trend-chart" aria-label="Curva diária de desempenho financeiro">
      <div className="financial-trend-controls" role="group" aria-label="Métrica do gráfico">
        {METRICS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={selectedKey === item.key ? "active" : ""}
            aria-pressed={selectedKey === item.key}
            onClick={() => setSelectedKey(item.key)}
          >
            <i style={{ background: item.color }} />{item.label}
          </button>
        ))}
      </div>
      <div className="financial-trend-stats" aria-live="polite">
        <span>Maior <b>{brlExact(high)}</b></span>
        <span>Menor <b>{brlExact(low)}</b></span>
        <span>Variação <b className={change !== null && change < 0 ? "negative" : "positive"}>{change === null ? "—" : `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(1).replace(".", ",")}%`}</b></span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 18, right: 10, left: 2, bottom: 6 }}
          onClick={(state) => {
            const index = state?.activeTooltipIndex;
            const point = typeof index === "number" ? data[index] : undefined;
            if (point) onPointClick?.(point.date, selectedKey);
          }}
        >
          <defs>
            <linearGradient id="financial-selected-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={metric.color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={metric.color} stopOpacity={0.015} />
            </linearGradient>
            <filter id="financial-line-shadow" x="-30%" y="-40%" width="160%" height="180%">
              <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor={metric.color} floodOpacity="0.2" />
            </filter>
          </defs>

          <CartesianGrid vertical={false} stroke="#9eb1cc" strokeDasharray="4 8" strokeOpacity={0.48} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            interval={tickInterval}
            minTickGap={34}
            tick={{ fill: "#7184a2", fontSize: 10 }}
            tickMargin={12}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#7184a2", fontSize: 10 }}
            tickFormatter={(value: number) => compactBrl(value)}
            width={58}
            tickMargin={8}
          />
          <Tooltip
            content={<FinancialTooltip metric={metric} />}
            cursor={{ stroke: "#7791bd", strokeDasharray: "4 5", strokeOpacity: 0.7 }}
          />
          <Area type="monotone" dataKey={selectedKey} stroke="none" fill="url(#financial-selected-area)" isAnimationActive />
          <Line
            type="monotone"
            dataKey={selectedKey}
            name={metric.label}
            stroke={metric.color}
            strokeWidth={3.2}
            filter="url(#financial-line-shadow)"
            dot={{ r: 2.8, fill: metric.color, stroke: "#f8fbff", strokeWidth: 1.6 }}
            activeDot={{ r: 6, fill: metric.color, stroke: "#fff", strokeWidth: 2 }}
            isAnimationActive
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="financial-trend-legend" aria-label="Legenda do gráfico">
        <span><i style={{ background: metric.color }} />Evolução diária de {metric.label.toLocaleLowerCase()}</span>
      </div>
    </div>
  );
}
