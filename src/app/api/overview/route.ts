import { NextResponse } from "next/server";
import {
  buildInsights,
  calculateFinancials,
  categoryBreakdown,
  filterByPeriod,
  isPeriod,
  monthlySeries,
  percentChange,
  previousPeriod,
  weekdayBreakdown,
  type Period,
} from "@/lib/finance";
import { getDatabase } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("period");
  const period: Period = isPeriod(requested) ? requested : "mes";
  const db = getDatabase();

  const scoped = filterByPeriod(db.transactions, period);
  const current = calculateFinancials(scoped);
  const previous = calculateFinancials(previousPeriod(db.transactions, period));
  const today = new Date().toISOString().slice(0, 10);

  return NextResponse.json({
    company: db.company,
    period,
    financials: current,
    comparison: {
      revenue: percentChange(current.grossRevenue, previous.grossRevenue),
      costs: percentChange(current.costs, previous.costs),
      profit: percentChange(current.netProfit, previous.netProfit),
      previous,
    },
    series: monthlySeries(db.transactions, 8),
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
}
