"use client";

import { useState, type PointerEvent } from "react";

export type DonutSlice = { label: string; value: number; color: string };

type Props = {
  slices: DonutSlice[];
  /** Texto grande no centro — normalmente o total formatado. */
  centerValue: string;
  centerLabel?: string;
  size?: number;
  formatValue?: (value: number) => string;
};

const THICKNESS = 26;
const TAU = Math.PI * 2;

export function Donut({ slices, centerValue, centerLabel = "Total", size = 190, formatValue }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const activeSlice = activeIndex === null ? null : slices[activeIndex];
  const activeShare = activeSlice && total ? (activeSlice.value / total) * 100 : 0;
  const activeValue = activeSlice ? (formatValue ? formatValue(activeSlice.value) : String(activeSlice.value)) : centerValue;
  const activeLabel = activeSlice ? activeSlice.label : centerLabel;
  let progress = 0;
  const gradientStops = total > 0
    ? slices.filter((slice) => slice.value > 0).map((slice) => {
      const start = (progress / total) * 100;
      progress += slice.value;
      const end = (progress / total) * 100;
      return `${slice.color} ${start}% ${end}%`;
    })
    : [];

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!total) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - bounds.left - bounds.width / 2;
    const dy = event.clientY - bounds.top - bounds.height / 2;
    const distance = Math.hypot(dx, dy);
    const outerRadius = Math.min(bounds.width, bounds.height) / 2;
    const innerRadius = outerRadius - THICKNESS;
    if (distance < innerRadius || distance > outerRadius) {
      setActiveIndex(null);
      return;
    }

    const angle = (Math.atan2(dy, dx) + Math.PI / 2 + TAU) % TAU;
    const target = (angle / TAU) * total;
    let accumulated = 0;
    const index = slices.findIndex((slice) => {
      accumulated += slice.value;
      return target < accumulated;
    });
    setActiveIndex(index < 0 ? slices.length - 1 : index);
  };

  return (
    <div className={`donut-wrap ${activeSlice ? "is-slice-active" : ""}`} onMouseLeave={() => setActiveIndex(null)}>
      <div
        className="donut-visual"
        role="img"
        aria-label={`Composição por categoria. ${slices.map((slice) => `${slice.label}: ${formatValue ? formatValue(slice.value) : slice.value}`).join(", ")}`}
        style={{ width: size, height: size }}
        onPointerMove={handlePointerMove}
      >
        <div
          className="donut-ring"
          aria-hidden="true"
          style={{
            background: gradientStops.length ? `conic-gradient(from -90deg, ${gradientStops.join(", ")})` : undefined,
          }}
        />
        <div className="donut-center-content" aria-live="polite">
          <span className="donut-center-label">{activeSlice ? "Participação" : activeLabel}</span>
          <strong className="donut-center">{activeSlice ? `${activeShare.toFixed(1)}%` : activeValue}</strong>
        </div>
        {activeSlice && (
          <div className="donut-tooltip" role="status">
            <strong>{activeSlice.label}</strong>
            <span>{activeValue}</span>
            <small>{activeShare.toFixed(1)}% do total de custos</small>
          </div>
        )}
      </div>

      <div className="donut-legend">
        {slices.map((slice, index) => (
          <button
            className={activeIndex === index ? "is-active" : ""}
            key={slice.label}
            type="button"
            aria-pressed={activeIndex === index}
            onMouseEnter={() => setActiveIndex(index)}
            onFocus={() => setActiveIndex(index)}
            onClick={() => setActiveIndex((current) => current === index ? null : index)}
          >
            <i style={{ background: slice.color }} />
            {slice.label}
            <b>{formatValue ? formatValue(slice.value) : slice.value}</b>
            <em>{total ? `${((slice.value / total) * 100).toFixed(1)}%` : "0%"}</em>
          </button>
        ))}
      </div>
    </div>
  );
}
