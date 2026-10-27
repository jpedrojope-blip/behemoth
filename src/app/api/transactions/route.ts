import { NextResponse } from "next/server";
import {
  calculateFinancials,
  calculateCashFlow,
  calculateCashPosition,
  calculateCashPositionForMonth,
  categoryBreakdown,
  dailyFinancialSeries,
  availableDreMonths,
  availableFinancialMonths,
  dreBreakdown,
  filterByMonth,
  filterByPeriod,
  isPeriod,
  monthlySeries,
  percentChange,
  previousPeriod,
  type Period,
} from "@/lib/finance";
import { parseBody, transactionCreateSchema } from "@/lib/schemas";
import { createId, recordAudit } from "@/lib/store";
import { withWorkspaceDatabase } from "@/lib/workspace-store";
import type { Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("period");
  const period: Period = isPeriod(requested) ? requested : "mes";
  const currentMonth = new Date();
  const currentDreMonth = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;
  const requestedDreMonth = url.searchParams.get("dreMonth");
  const dreMonth = requestedDreMonth && /^(\d{4})-(0[1-9]|1[0-2])$/.test(requestedDreMonth)
    ? requestedDreMonth
    : currentDreMonth;
  const requestedChartMonth = url.searchParams.get("chartMonth");
  const chartMonth = requestedChartMonth && /^(\d{4})-(0[1-9]|1[0-2])$/.test(requestedChartMonth)
    ? requestedChartMonth
    : currentDreMonth;
  const category = url.searchParams.get("category");
  const kind = url.searchParams.get("kind");
  const allTransactions = url.searchParams.get("all") === "true";
  const detailMonth = url.searchParams.get("detailMonth");
  const requestedDetailReport = url.searchParams.get("detailReport");
  const detailReport = requestedDetailReport === "DRE" || requestedDetailReport === "DFC" || requestedDetailReport === "ANY"
    ? requestedDetailReport
    : null;

  return withWorkspaceDatabase(request, (db) => {
    const reference = new Date();
    const listed = allTransactions
      ? db.transactions
      : detailReport
        ? detailMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(detailMonth)
          ? filterByMonth(db.transactions, detailMonth, detailReport)
          : filterByPeriod(db.transactions, period, reference, detailReport)
        : filterByPeriod(db.transactions, period, reference, "ANY");
    const dreScoped = filterByPeriod(db.transactions, period, reference, "DRE");
    const selectedDreScoped = filterByMonth(db.transactions, dreMonth, "DRE");
    const cashScoped = filterByPeriod(db.transactions, period, reference, "DFC");
    const selectedDreCashScoped = filterByMonth(db.transactions, dreMonth, "DFC");
    const filtered = listed.filter(
      (transaction) =>
        (!category || category === "todas" || transaction.category === category) &&
        (!kind || kind === "todos" || transaction.kind === kind),
    );
    const current = calculateFinancials(dreScoped);
    const previous = calculateFinancials(previousPeriod(db.transactions, period, reference, "DRE"));

    return NextResponse.json({
      period,
      chartMonth,
      chartMonths: availableDreMonths(db.transactions, reference),
      dreMonth,
      dreMonths: availableDreMonths(db.transactions, reference),
      availableMonths: availableFinancialMonths(db.transactions, detailReport ?? "DRE"),
      transactions: [...filtered].sort((a, b) => b.date.localeCompare(a.date)),
      financials: current,
      dreFinancials: calculateFinancials(selectedDreScoped),
      cashFlow: calculateCashFlow(cashScoped),
      dreCashFlow: calculateCashFlow(selectedDreCashScoped),
      dreCashPosition: calculateCashPositionForMonth(
        db.transactions,
        dreMonth,
        db.company.cashOpeningBalance,
        db.company.cashOpeningDate,
      ),
      cashPosition: calculateCashPosition(
        db.transactions,
        period,
        db.company.cashOpeningBalance,
        db.company.cashOpeningDate,
        reference,
      ),
      comparison: {
        revenue: percentChange(current.grossRevenue, previous.grossRevenue),
        costs: percentChange(current.costs, previous.costs),
        profit: percentChange(current.netProfit, previous.netProfit),
      },
      categories: [...new Set(db.transactions.map((transaction) => transaction.category))].sort(),
      series: monthlySeries(db.transactions, 8),
      performanceSeries: dailyFinancialSeries(filterByMonth(db.transactions, chartMonth, "DRE")),
      incomeByCategory: categoryBreakdown(dreScoped, "INCOME"),
      expensesByCategory: categoryBreakdown(dreScoped, "EXPENSE"),
      cashExpensesByCategory: categoryBreakdown(cashScoped, "EXPENSE", "DFC"),
      dreBreakdown: dreBreakdown(selectedDreScoped),
      automated: listed.filter((transaction) => transaction.auto).length,
    });
  });
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, transactionCreateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  return withWorkspaceDatabase(request, (db) => {
    const transaction: Transaction = {
      id: createId("tx"),
      companyId: db.company.id,
      kind: body.kind,
      date: body.date ?? body.competenceDate ?? body.cashDate ?? new Date().toISOString().slice(0, 10),
      ...(body.counterparty ? { counterparty: body.counterparty } : {}),
      ...(body.financialReport !== "DFC" ? { competenceDate: body.competenceDate ?? body.date } : {}),
      ...(body.financialReport === "DFC" ? { cashDate: body.cashDate ?? body.date } : body.financialReport === "BOTH" && body.cashDate ? { cashDate: body.cashDate } : {}),
      ...(body.financialReport === "DFC" || (body.financialReport === "BOTH" && body.cashDate) ? { cashDateConfirmed: true } : {}),
      financialReport: body.financialReport,
      costBehavior: body.kind === "EXPENSE" ? body.costBehavior : undefined,
      description: body.description,
      category: body.category || (body.kind === "INCOME" ? "Receita" : "Outros"),
      accountCode: body.accountCode,
      amount: body.amount,
      source: body.source ?? "manual",
      status: body.status,
      recurrence: body.recurrence,
    };
    db.transactions.push(transaction);
    recordAudit(db, "CREATE", "transaction", transaction.id);
    return NextResponse.json({ transaction, financials: calculateFinancials(db.transactions) }, { status: 201 });
  });
}
