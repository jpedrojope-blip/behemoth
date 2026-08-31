"use client";

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

export function Donut({ slices, centerValue, centerLabel = "Total", size = 190, formatValue }: Props) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = (size - THICKNESS) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let offset = 0;

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" style={{ flex: "none" }}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#16243d" strokeWidth={THICKNESS} />
        {total > 0 &&
          slices.map((slice) => {
            const fraction = slice.value / total;
            const dash = fraction * circumference;
            const element = (
              <circle
                key={slice.label}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={THICKNESS}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${center} ${center})`}
              >
                <title>{`${slice.label}: ${(fraction * 100).toFixed(1)}%`}</title>
              </circle>
            );
            offset += dash;
            return element;
          })}
        <text x={center} y={center - 2} textAnchor="middle" className="donut-center-label">
          {centerLabel}
        </text>
        <text x={center} y={center + 17} textAnchor="middle" className="donut-center">
          {centerValue}
        </text>
      </svg>

      <div className="donut-legend">
        {slices.map((slice) => (
          <div key={slice.label}>
            <i style={{ background: slice.color }} />
            {slice.label}
            <b>{formatValue ? formatValue(slice.value) : slice.value}</b>
            <em>{total ? `${((slice.value / total) * 100).toFixed(1)}%` : "0%"}</em>
          </div>
        ))}
      </div>
    </div>
  );
}
