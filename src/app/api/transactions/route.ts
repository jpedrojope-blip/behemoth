import { NextResponse } from "next/server";
import {
  calculateFinancials,
  categoryBreakdown,
  filterByPeriod,
  isPeriod,
  monthlySeries,
  percentChange,
  previousPeriod,
  type Period,
} from "@/lib/finance";
import { parseBody, transactionCreateSchema } from "@/lib/schemas";
import { createId, mutate, recordAudit } from "@/lib/store";
import type { Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("period");
  const period: Period = isPeriod(requested) ? requested : "mes";
  const category = url.searchParams.get("category");
  const kind = url.searchParams.get("kind");

  return mutate((db) => {
    const scoped = filterByPeriod(db.transactions, period);
    const filtered = scoped.filter(
      (transaction) =>
        (!category || category === "todas" || transaction.category === category) &&
        (!kind || kind === "todos" || transaction.kind === kind),
    );
    const current = calculateFinancials(scoped);
    const previous = calculateFinancials(previousPeriod(db.transactions, period));

    return NextResponse.json({
      period,
      transactions: [...filtered].sort((a, b) => b.date.localeCompare(a.date)),
      financials: current,
      comparison: {
        revenue: percentChange(current.grossRevenue, previous.grossRevenue),
        costs: percentChange(current.costs, previous.costs),
        profit: percentChange(current.netProfit, previous.netProfit),
      },
      categories: [...new Set(db.transactions.map((transaction) => transaction.category))].sort(),
      series: monthlySeries(db.transactions, 8),
      incomeByCategory: categoryBreakdown(scoped, "INCOME"),
      expensesByCategory: categoryBreakdown(scoped, "EXPENSE"),
      automated: scoped.filter((transaction) => transaction.auto).length,
    });
  });
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, transactionCreateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  return mutate((db) => {
    const transaction: Transaction = {
      id: createId("tx"),
      companyId: db.company.id,
      kind: body.kind,
      date: body.date ?? new Date().toISOString().slice(0, 10),
      description: body.description,
      category: body.category || (body.kind === "INCOME" ? "Receita" : "Outros"),
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
