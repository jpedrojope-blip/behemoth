"use client";

import { LineCharts9 } from "@/components/ui/line-charts-9";
import type { FinancialTimelinePoint } from "@/lib/finance";

type Props = {
  points: FinancialTimelinePoint[];
  height?: number;
};

/** A curva usa os dias com lançamentos confirmados, sem criar períodos zerados. */
export function FinancialPerformanceChart({ points, height = 240 }: Props) {
  if (!points.length) {
    return <p className="empty financial-chart-empty">Ainda não há lançamentos suficientes para gerar este gráfico.</p>;
  }

  return <LineCharts9 points={points} height={height} />;
}
