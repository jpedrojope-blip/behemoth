import { NextResponse } from "next/server";
import {
  buildInsights,
  calculateFinancials,
  categoryBreakdown,
  dailyFinancialSeries,
  availableDreMonths,
  filterByMonth,
  filterByPeriod,
  isPeriod,
  monthlySeries,
  percentChange,
  previousPeriod,
  weekdayBreakdown,
  type Period,
} from "@/lib/finance";
import { withWorkspaceDatabase } from "@/lib/workspace-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("period");
  const period: Period = isPeriod(requested) ? requested : "mes";
  const currentMonth = new Date();
  const currentMonthValue = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;
  const requestedChartMonth = url.searchParams.get("chartMonth");
  const chartMonth = requestedChartMonth && /^(\d{4})-(0[1-9]|1[0-2])$/.test(requestedChartMonth)
    ? requestedChartMonth
    : currentMonthValue;
  return withWorkspaceDatabase(request, (db) => {
  const scoped = filterByPeriod(db.transactions, period);
  const current = calculateFinancials(scoped);
  const previous = calculateFinancials(previousPeriod(db.transactions, period));
  const chartMonthScoped = filterByMonth(db.transactions, chartMonth);
  const chartFinancials = calculateFinancials(chartMonthScoped);
  const [chartYear, chartMonthNumber] = chartMonth.split("-").map(Number);
  const previousChartDate = new Date(chartYear, chartMonthNumber - 2, 1);
  const previousChartMonth = `${previousChartDate.getFullYear()}-${String(previousChartDate.getMonth() + 1).padStart(2, "0")}`;
  const previousChartFinancials = calculateFinancials(filterByMonth(db.transactions, previousChartMonth));
  const today = new Date().toISOString().slice(0, 10);

  return NextResponse.json({
    company: db.company,
    period,
    chartMonth,
    chartMonths: availableDreMonths(db.transactions),
    financials: current,
    chartFinancials,
    chartComparison: { revenue: percentChange(chartFinancials.grossRevenue, previousChartFinancials.grossRevenue) },
    comparison: {
      revenue: percentChange(current.grossRevenue, previous.grossRevenue),
      costs: percentChange(current.costs, previous.costs),
      profit: percentChange(current.netProfit, previous.netProfit),
      previous,
    },
    series: monthlySeries(db.transactions, 8),
    performanceSeries: dailyFinancialSeries(chartMonthScoped),
    weekday: weekdayBreakdown(db.transactions, period),
    expensesByCategory: categoryBreakdown(scoped, "EXPENSE"),
    insights: buildInsights(db.transactions, period),
    agenda: db.events
      .filter((event) => event.date === today)
      .sort((a, b) => a.time.localeCompare(b.time)),
    upcoming: db.events
      .filter((event) => event.date > today)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
      .slice(0, 5),
    team: {
      total: db.team.length,
      humans: db.team.filter((member) => member.type === "HUMAN").length,
      agents: db.team.filter((member) => member.type === "AI").length,
      monthlyCost: db.team.reduce((total, member) => total + member.monthlyCost, 0),
    },
    openActionItems: db.meetings.reduce(
      (total, meeting) => total + meeting.actionItems.filter((item) => !item.done).length,
      0,
    ),
    recentTransactions: [...db.transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5),
  });
  });
}
