"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { brlExact, compactBrl, niceScale } from "@/lib/format";

export type BarSeries = { label: string; values: number[]; color: string };

type Props = {
  labels: string[];
  series: BarSeries[];
  height?: number;
  /** Destaca a última barra — usado para o mês/dia corrente. */
  highlightLast?: boolean;
};

const PADDING = { top: 14, right: 8, bottom: 26, left: 52 };

export function BarChart({ labels, series, height = 230, highlightLast = false }: Props) {
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
    const all = series.flatMap((entry) => entry.values);
    const max = Math.max(...all, 0);
    const scale = niceScale(max);
    const plotWidth = Math.max(width - PADDING.left - PADDING.right, 10);
    const plotHeight = height - PADDING.top - PADDING.bottom;
    const groups = Math.max(labels.length, 1);
    const slot = plotWidth / groups;
    const barGap = 3;
    const barWidth = Math.max((slot * 0.62 - barGap * (series.length - 1)) / series.length, 2);

    const y = (value: number) => PADDING.top + (1 - value / (scale.max || 1)) * plotHeight;
    const groupX = (index: number) => PADDING.left + slot * index + slot / 2;

    const ticks: number[] = [];
    for (let value = 0; value <= scale.max + scale.step / 2; value += scale.step) ticks.push(Math.round(value));

    return { y, groupX, ticks, slot, barWidth, plotHeight, hasData: max > 0 };
  }, [series, labels.length, width, height]);

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - bounds.left) / bounds.width) * width;
    const index = Math.floor((position - PADDING.left) / geometry.slot);
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

  const baseline = height - PADDING.bottom;

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
        {geometry.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={geometry.y(tick)}
              y2={geometry.y(tick)}
              stroke="#16243d"
              strokeWidth={1}
            />
            <text x={PADDING.left - 10} y={geometry.y(tick) + 4} textAnchor="end" className="chart-tick">
              {compactBrl(tick)}
            </text>
          </g>
        ))}

        {labels.map((label, index) => {
          const center = geometry.groupX(index);
          const totalWidth = geometry.barWidth * series.length + 3 * (series.length - 1);
          const start = center - totalWidth / 2;
          const isLast = highlightLast && index === labels.length - 1;

          return (
            <g key={label}>
              {hover === index && (
                <rect
                  x={center - geometry.slot / 2}
                  y={PADDING.top - 6}
                  width={geometry.slot}
                  height={geometry.plotHeight + 12}
                  fill="#ffffff08"
                  rx={6}
                />
              )}
              {series.map((entry, seriesIndex) => {
                const value = entry.values[index] ?? 0;
                const top = geometry.y(value);
                const barHeight = Math.max(baseline - top, value > 0 ? 2 : 0);
                return (
                  <rect
                    key={entry.label}
                    x={start + seriesIndex * (geometry.barWidth + 3)}
                    y={top}
                    width={geometry.barWidth}
                    height={barHeight}
                    rx={Math.min(4, geometry.barWidth / 2)}
                    fill={isLast && seriesIndex === 0 ? "#93c5fd" : entry.color}
                    opacity={hover === null || hover === index ? 1 : 0.5}
                  />
                );
              })}
            </g>
          );
        })}

        <line x1={PADDING.left} x2={width - PADDING.right} y1={baseline} y2={baseline} stroke="#1c2c4b" />

        {labels.map((label, index) => (
          <text
            key={label}
            x={geometry.groupX(index)}
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
          style={{ left: Math.min(Math.max(geometry.groupX(hover), 95), width - 95), top: PADDING.top }}
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

      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((entry) => (
            <span key={entry.label}>
              <i style={{ background: entry.color }} />
              {entry.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
