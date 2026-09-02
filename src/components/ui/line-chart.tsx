"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { brlExact, compactBrl, niceScale } from "@/lib/format";

export type ChartSeries = { label: string; values: number[]; color: string; fill?: boolean };

type Props = {
  labels: string[];
  series: ChartSeries[];
  height?: number;
};

const PADDING = { top: 14, right: 14, bottom: 26, left: 58 };

export function LineChart({ labels, series, height = 240 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;
      if (measured > 0) setWidth(measured);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const values = series.flatMap((entry) => entry.values);
    const rawMax = Math.max(...values, 0);
    const rawMin = Math.min(...values, 0);
    const top = niceScale(rawMax).max;
    const bottom = rawMin < 0 ? -niceScale(Math.abs(rawMin)).max : 0;
    const span = top - bottom || 1;

    const plotWidth = Math.max(width - PADDING.left - PADDING.right, 10);
    const plotHeight = height - PADDING.top - PADDING.bottom;
    const count = Math.max(labels.length, 2);

    const x = (index: number) => PADDING.left + (index / (count - 1)) * plotWidth;
    const y = (value: number) => PADDING.top + (1 - (value - bottom) / span) * plotHeight;

    const ticks = Array.from({ length: 5 }, (_, index) => Math.round(bottom + (span * index) / 4));

    return { x, y, ticks, plotWidth, plotHeight, hasData: rawMax > 0 || rawMin < 0 };
  }, [series, labels.length, width, height]);

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientX - bounds.left;
    const count = Math.max(labels.length, 2);
    const ratio = (position - PADDING.left) / geometry.plotWidth;
    const index = Math.round(ratio * (count - 1));
    setHover(index >= 0 && index < labels.length ? index : null);
  }

  if (!geometry.hasData) {
    return (
      <div ref={containerRef}>
        <p className="empty" style={{ marginTop: 18 }}>
          Sem valores no período para desenhar o gráfico.
        </p>
      </div>
    );
  }

  return (
    <div className="chart-shell" ref={containerRef}>
      <svg
        className="chart-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {series.map((entry) => (
            <linearGradient key={entry.label} id={`fill-${slug(entry.label)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={entry.color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={entry.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {geometry.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={geometry.y(tick)}
              y2={geometry.y(tick)}
              stroke={tick === 0 ? "#22355c" : "#16243d"}
              strokeWidth={1}
            />
            <text x={PADDING.left - 10} y={geometry.y(tick) + 4} textAnchor="end" className="chart-tick">
              {compactBrl(tick)}
            </text>
          </g>
        ))}

        {hover !== null && (
          <line
            x1={geometry.x(hover)}
            x2={geometry.x(hover)}
            y1={PADDING.top}
            y2={height - PADDING.bottom}
            stroke="#365586"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        )}

        {series.map((entry) => {
          const path = entry.values
            .map((value, index) => `${index ? "L" : "M"}${geometry.x(index)},${geometry.y(value)}`)
            .join(" ");
          return (
            <g key={entry.label}>
              {entry.fill && (
                <path
                  d={`${path} L${geometry.x(entry.values.length - 1)},${height - PADDING.bottom} L${geometry.x(0)},${
                    height - PADDING.bottom
                  } Z`}
                  fill={`url(#fill-${slug(entry.label)})`}
                  stroke="none"
                />
              )}
              <path d={path} fill="none" stroke={entry.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              {entry.values.map((value, index) => (
                <circle
                  key={`${entry.label}-${index}`}
                  cx={geometry.x(index)}
                  cy={geometry.y(value)}
                  r={hover === index ? 5 : 3}
                  fill="#0f1c35"
                  stroke={entry.color}
                  strokeWidth={2}
                />
              ))}
            </g>
          );
        })}

        {labels.map((label, index) => (
          <text
            key={label}
            x={geometry.x(index)}
            y={height - 8}
            textAnchor="middle"
            className={`chart-tick ${hover === index ? "active" : ""}`}
          >
            {label}
          </text>
        ))}
      </svg>

      {hover !== null && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min(Math.max(geometry.x(hover), 90), width - 90),
            top: PADDING.top,
          }}
        >
          <strong>{labels[hover]}</strong>
          {series.map((entry) => (
            <span key={entry.label}>
              <i style={{ background: entry.color }} />
              {entry.label}
              <b>{brlExact(entry.values[hover] ?? 0)}</b>
            </span>
          ))}
        </div>
      )}

      <div className="chart-legend">
        {series.map((entry) => (
          <span key={entry.label}>
            <i style={{ background: entry.color }} />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function slug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
}
