"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { brlExact, compactBrl, niceScale } from "@/lib/format";

export type ChartSeries = {
  label: string;
  values: Array<number | null>;
  color: string;
  fill?: boolean;
  lineStyle?: "solid" | "dashed";
};

type Props = {
  labels: string[];
  series: ChartSeries[];
  height?: number;
  ariaLabel?: string;
};

const PADDING = { top: 14, right: 14, bottom: 26, left: 58 };

type ChartPoint = { index: number; value: number };

function splitIntoSegments(values: Array<number | null>): ChartPoint[][] {
  const segments: ChartPoint[][] = [];
  let current: ChartPoint[] = [];

  values.forEach((value, index) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      current.push({ index, value });
      return;
    }
    if (current.length) segments.push(current);
    current = [];
  });
  if (current.length) segments.push(current);
  return segments;
}

export function LineChart({ labels, series, height = 240, ariaLabel }: Props) {
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
    const values = series
      .flatMap((entry) => entry.values)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
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
  const labelStep = Math.max(1, Math.ceil(labels.length / 7));

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
        aria-label={ariaLabel}
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

        {series.map((entry, seriesIndex) => {
          const segments = splitIntoSegments(entry.values);
          const pathFor = (segment: ChartPoint[]) => segment
            .map((point, index) => `${index ? "L" : "M"}${geometry.x(point.index)},${geometry.y(point.value)}`)
            .join(" ");
          const path = segments.map(pathFor).join(" ");
          return (
            <g key={entry.label}>
              {entry.fill && segments.map((segment, index) => {
                const first = segment[0];
                const last = segment.at(-1)!;
                return <path
                  className="chart-area-fill"
                  d={`${pathFor(segment)} L${geometry.x(last.index)},${height - PADDING.bottom} L${geometry.x(first.index)},${height - PADDING.bottom} Z`}
                  fill={`url(#fill-${slug(entry.label)})`}
                  stroke="none"
                  style={{ animationDelay: `${seriesIndex * 80 + index * 40}ms` }}
                  key={`${entry.label}-area-${index}`}
                />;
              })}
              <path
                className={`chart-line-path ${entry.lineStyle === "dashed" ? "chart-line-dashed" : ""}`}
                d={path}
                pathLength={entry.lineStyle === "dashed" ? undefined : 1}
                fill="none"
                stroke={entry.color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ animationDelay: `${seriesIndex * 80}ms` }}
              />
              {entry.values.map((value, index) => {
                if (typeof value !== "number") return null;
                return <circle
                  key={`${entry.label}-${index}`}
                  className="chart-point"
                  cx={geometry.x(index)}
                  cy={geometry.y(value)}
                  r={hover === index ? 5 : 3}
                  fill="#0f1c35"
                  stroke={entry.color}
                  strokeWidth={2}
                  style={{ animationDelay: `${120 + seriesIndex * 80 + index * 28}ms` }}
                />;
              })}
            </g>
          );
        })}

        {labels.map((label, index) => {
          if (index % labelStep !== 0 && index !== labels.length - 1) return null;
          return (
            <text
              key={label}
              x={geometry.x(index)}
              y={height - 8}
              textAnchor="middle"
              className={`chart-tick ${hover === index ? "active" : ""}`}
            >
              {label}
            </text>
          );
        })}
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
              <b>{typeof entry.values[hover] === "number" ? brlExact(entry.values[hover]) : "Sem movimento"}</b>
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
