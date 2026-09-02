import type { Insight, Transaction } from "@/lib/types";

export type Period = "hoje" | "semana" | "mes" | "trimestre";

export const PERIOD_LABELS: Record<Period, string> = {
  hoje: "Hoje",
  semana: "Esta semana",
  mes: "Este mês",
  trimestre: "Últimos 3 meses",
};

export function isPeriod(value: string | null): value is Period {
  return value === "hoje" || value === "semana" || value === "mes" || value === "trimestre";
}

function startOfPeriod(period: Period, reference = new Date()) {
  const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  if (period === "hoje") return start;
  if (period === "semana") {
    const weekday = (start.getDay() + 6) % 7; // segunda = 0
    start.setDate(start.getDate() - weekday);
    return start;
  }
  if (period === "mes") return new Date(reference.getFullYear(), reference.getMonth(), 1);
  return new Date(reference.getFullYear(), reference.getMonth() - 2, 1);
}

function parseDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function filterByPeriod(transactions: Transaction[], period: Period, reference = new Date()) {
  const start = startOfPeriod(period, reference);
  const end = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate(), 23, 59, 59);
  if (period === "semana") end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)));
  if (period === "mes") end.setMonth(end.getMonth() + 1, 0);
  if (period === "trimestre") end.setMonth(end.getMonth() + 3, 0);
  return transactions.filter((transaction) => {
    const date = parseDate(transaction.date);
    return date >= start && date <= end;
  });
}

export function previousPeriod(transactions: Transaction[], period: Period, reference = new Date()) {
  const start = startOfPeriod(period, reference);
  const previousReference = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const previousStart = startOfPeriod(period, previousReference);
  return transactions.filter((transaction) => {
    const date = parseDate(transaction.date);
    return date >= previousStart && date <= previousReference;
  });
}

export type Financials = {
  grossRevenue: number;
  taxes: number;
  cmv: number;
  operationalExpenses: number;
  netRevenue: number;
  grossProfit: number;
  grossMargin: number;
  cashFlow: number;
  costs: number;
  netProfit: number;
  netMargin: number;
  transactionCount: number;
  pending: number;
};

function sum(transactions: Transaction[]) {
  return transactions.reduce((total, transaction) => total + transaction.amount, 0);
}

export function calculateFinancials(transactions: Transaction[]): Financials {
  const confirmed = transactions.filter((transaction) => transaction.status === "CONFIRMED");
  const grossRevenue = sum(confirmed.filter((transaction) => transaction.kind === "INCOME"));
  const expenses = confirmed.filter((transaction) => transaction.kind === "EXPENSE");
  const categoryTotal = (pattern: RegExp) => sum(expenses.filter((transaction) => pattern.test(transaction.category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())));
  const taxes = categoryTotal(/imposto|tribut|simples/);
  const cmv = categoryTotal(/cmv|custo|fornecedor|embalag/);
  const operationalExpenses = Math.max(0, sum(expenses) - taxes - cmv);
  const costs = sum(expenses);
  const netRevenue = grossRevenue - taxes;
  const grossProfit = netRevenue - cmv;
  return {
    grossRevenue,
    taxes,
    cmv,
    operationalExpenses,
    netRevenue,
    grossProfit,
    grossMargin: grossRevenue ? grossProfit / grossRevenue : 0,
    cashFlow: grossRevenue - costs,
    costs,
    netProfit: grossRevenue - costs,
    netMargin: grossRevenue ? (grossRevenue - costs) / grossRevenue : 0,
    transactionCount: transactions.length,
    pending: transactions.filter((transaction) => transaction.status === "PENDING").length,
  };
}

export function percentChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export type MonthlyPoint = { label: string; month: string; income: number; expense: number; profit: number; count: number };

export function monthlySeries(transactions: Transaction[], months = 8, reference = new Date()): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(reference.getFullYear(), reference.getMonth() - index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const scoped = transactions.filter(
      (transaction) => transaction.date.slice(0, 7) === key && transaction.status === "CONFIRMED",
    );
    const income = sum(scoped.filter((transaction) => transaction.kind === "INCOME"));
    const expense = sum(scoped.filter((transaction) => transaction.kind === "EXPENSE"));
    points.push({
      label: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      month: key,
      income,
      expense,
      profit: income - expense,
      count: scoped.length,
    });
  }
  return points;
}

export type CategoryTotal = { category: string; amount: number; share: number };

export function categoryBreakdown(transactions: Transaction[], kind: Transaction["kind"]): CategoryTotal[] {
  const scoped = transactions.filter(
    (transaction) => transaction.kind === kind && transaction.status === "CONFIRMED",
  );
  const total = sum(scoped);
  const totals = new Map<string, number>();
  for (const transaction of scoped) {
    totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + transaction.amount);
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount, share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

function ptNumber(value: number, fractionDigits = 1) {
  return value.toFixed(fractionDigits).replace(".", ",");
}

export type WeekdayPoint = { label: string; income: number; expense: number };

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Distribui o período pelos dias da semana — base do "Relatório Semanal". */
export function weekdayBreakdown(transactions: Transaction[], period: Period, reference = new Date()): WeekdayPoint[] {
  const points: WeekdayPoint[] = WEEKDAY_LABELS.map((label) => ({ label, income: 0, expense: 0 }));

  for (const transaction of filterByPeriod(transactions, period, reference)) {
    if (transaction.status !== "CONFIRMED") continue;
    const date = parseDate(transaction.date);
    const index = (date.getDay() + 6) % 7; // segunda = 0
    if (transaction.kind === "INCOME") points[index].income += transaction.amount;
    else points[index].expense += transaction.amount;
  }

  return points;
}

export function buildInsights(transactions: Transaction[], period: Period, reference = new Date()): Insight[] {
  const scoped = filterByPeriod(transactions, period, reference);
  const current = calculateFinancials(scoped);
  const previous = calculateFinancials(previousPeriod(transactions, period, reference));
  const revenueChange = percentChange(current.grossRevenue, previous.grossRevenue);
  const costChange = percentChange(current.costs, previous.costs);
  const insights: Insight[] = [];

  if (current.grossRevenue > 0) {
    const healthy = revenueChange >= costChange;
    insights.push({
      id: "insight_margin",
      type: healthy ? "positive" : "attention",
      title: healthy ? "Margem líquida em alta" : "Custos crescendo acima da receita",
      text: healthy
        ? `Sua receita variou ${ptNumber(revenueChange)}% enquanto os custos variaram ${ptNumber(costChange)}%.`
        : `Os custos variaram ${ptNumber(costChange)}% contra ${ptNumber(revenueChange)}% da receita. Revise as maiores categorias.`,
      evidence: {
        receita: current.grossRevenue,
        custos: current.costs,
        margem: Number((current.netMargin * 100).toFixed(1)),
      },
    });
  }

  const expenses = categoryBreakdown(scoped, "EXPENSE");
  if (expenses.length) {
    const top = expenses[0];
    insights.push({
      id: "insight_top_expense",
      type: top.share > 0.5 ? "attention" : "neutral",
      title: `${top.category} concentra ${(top.share * 100).toFixed(0)}% dos custos`,
      text:
        top.share > 0.5
          ? "Uma única categoria concentra mais da metade das saídas. Vale negociar ou diluir esse custo."
          : "A distribuição de custos está equilibrada entre as categorias do período.",
      evidence: {
        categoria: top.category,
        valor: top.amount,
        participacao: Number((top.share * 100).toFixed(1)),
      },
    });
  }

  if (current.pending > 0) {
    insights.push({
      id: "insight_pending",
      type: "attention",
      title: `${current.pending} lançamento(s) aguardando confirmação`,
      text: "Lançamentos pendentes não entram no resultado. Confirme para manter o relatório fiel.",
      evidence: { pendentes: current.pending },
    });
  }

  if (!insights.length) {
    insights.push({
      id: "insight_empty",
      type: "neutral",
      title: "Sem dados suficientes no período",
      text: "Cadastre lançamentos para que a inteligência gere recomendações baseadas em dados reais.",
      evidence: { lancamentos: current.transactionCount },
    });
  }

  return insights;
}
