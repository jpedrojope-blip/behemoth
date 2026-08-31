"use client";

type Props = {
  /** Percentual de 0 a 100. */
  value: number;
  label: string;
  size?: number;
  color?: string;
};

const THICKNESS = 6;

export function Gauge({ value, label, size = 62, color = "#3b82f6" }: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - THICKNESS) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  const center = size / 2;

  return (
    <div className="gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${clamped}%`}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#16264a" strokeWidth={THICKNESS} />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={THICKNESS}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
        <text x={center} y={center + 5} textAnchor="middle" className="gauge-value">
          {Math.round(clamped)}%
        </text>
      </svg>
      <span>{label}</span>
    </div>
  );
}
