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

type FinancialStatement = "DRE" | "DFC" | "ANY";

function reportIncludes(transaction: Transaction, report: FinancialStatement) {
  if (report === "ANY") return true;
  const selected = transaction.financialReport ?? "BOTH";
  return selected === "BOTH" || selected === report;
}

function reportDates(transaction: Transaction, report: FinancialStatement) {
  if (report === "DRE") return [transaction.competenceDate ?? transaction.date];
  if (report === "DFC") return [transaction.cashDate ?? transaction.date];
  const selected = transaction.financialReport ?? "BOTH";
  if (selected === "DRE") return [transaction.competenceDate ?? transaction.date];
  if (selected === "DFC") return [transaction.cashDate ?? transaction.date];
  return [transaction.competenceDate ?? transaction.date, transaction.cashDate ?? transaction.date];
}

export function filterByPeriod(
  transactions: Transaction[],
  period: Period,
  reference = new Date(),
  report: FinancialStatement = "DRE",
) {
  const start = startOfPeriod(period, reference);
  const end = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate(), 23, 59, 59);
  if (period === "semana") end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)));
  if (period === "mes") end.setMonth(end.getMonth() + 1, 0);
  if (period === "trimestre") end.setMonth(end.getMonth() + 1, 0);
  return transactions.filter((transaction) => {
    return reportIncludes(transaction, report) && reportDates(transaction, report).some((value) => {
      const date = parseDate(value);
      return date >= start && date <= end;
    });
  });
}

export function previousPeriod(
  transactions: Transaction[],
  period: Period,
  reference = new Date(),
  report: FinancialStatement = "DRE",
) {
  const start = startOfPeriod(period, reference);
  const previousReference = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const previousStart = startOfPeriod(period, previousReference);
  return transactions.filter((transaction) => {
    return reportIncludes(transaction, report) && reportDates(transaction, report).some((value) => {
      const date = parseDate(value);
      return date >= previousStart && date <= previousReference;
    });
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
  costs: number;
  netProfit: number;
  netMargin: number;
  financialIncome: number;
  financialExpense: number;
  financialResult: number;
  nonOperatingIncome: number;
  nonOperatingExpense: number;
  nonOperatingResult: number;
  fixedExpenses: number;
  variableExpenses: number;
  contributionMargin: number;
  contributionMarginRate: number | null;
  breakEvenRevenue: number | null;
  targetProfitMargin: number;
  targetRevenue: number | null;
  transactionCount: number;
  pending: number;
};

export type CashFlowFinancials = {
  operational: number;
  nonOperating: number;
  investments: number;
  financing: number;
  freeCashFlow: number;
};

function sum(transactions: Transaction[]) {
  return transactions.reduce((total, transaction) => total + transaction.amount, 0);
}

function normalizeCategory(category: string) {
  return category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function categoryMatches(category: string, pattern: RegExp) {
  return pattern.test(normalizeCategory(category));
}

function isTax(category: string) {
  return categoryMatches(category, /imposto|tribut|simples|icms|iss\b|pis\b|cofins/);
}

function isDirectCost(category: string) {
  const normalized = normalizeCategory(category);
  return /cmv|custo da mercadoria|custo direto|custos variaveis|outros custos|fornecedor|embalagem|materia prima|insumo|compra.*(revenda|producao)/.test(normalized) ||
    (/\bcustos?\b/.test(normalized) && !/equipe|agente/.test(normalized));
}

function isFinancial(category: string) {
  return categoryMatches(category, /financeir|juros|tarifas? bancaria|taxas? bancaria|rendimento|aplicacao financeira/);
}

function isNonOperating(category: string) {
  return categoryMatches(category, /nao operacional|extraordinari/);
}

function isInvestment(category: string) {
  return categoryMatches(category, /investimento|imobilizado|equipamento|obra estrutural|capex/);
}

function isFinancing(category: string) {
  return categoryMatches(category, /aumento.*divida|aporte.*soci|pagamento.*divida|dividendo|emprestimo|financiamento/);
}

type AccountGroup = "REVENUE" | "TAX" | "DIRECT_COST" | "OPERATING_FIXED" | "OPERATING_VARIABLE" | "OPERATING" | "FINANCIAL" | "NON_OPERATING" | "INVESTMENT" | "FINANCING";

function accountGroup(code?: string): AccountGroup | null {
  const normalizedCode = code?.trim().replace(/,/g, ".");
  if (!normalizedCode) return null;
  if (/^1(?:\.|$)/.test(normalizedCode)) return "REVENUE";
  if (/^2(?:\.|$)/.test(normalizedCode)) return "TAX";
  if (/^3(?:\.|$)/.test(normalizedCode)) return "DIRECT_COST";
  if (/^4\.0?1(?:\.|$)|^4\.0?2(?:\.|$)/.test(normalizedCode)) return "OPERATING_FIXED";
  if (/^4\.0?3(?:\.|$)/.test(normalizedCode)) return "OPERATING_VARIABLE";
  if (/^4(?:\.|$)/.test(normalizedCode)) return "OPERATING";
  if (/^5(?:\.|$)/.test(normalizedCode)) return "FINANCIAL";
  if (/^6(?:\.|$)/.test(normalizedCode)) return "NON_OPERATING";
  if (/^7(?:\.|$)/.test(normalizedCode)) return "INVESTMENT";
  if (/^8(?:\.|$)/.test(normalizedCode)) return "FINANCING";
  return null;
}

function transactionIsTax(transaction: Transaction) {
  const group = accountGroup(transaction.accountCode);
  return group ? group === "TAX" : isTax(transaction.category);
}

function transactionIsDirectCost(transaction: Transaction) {
  const group = accountGroup(transaction.accountCode);
  return group ? group === "DIRECT_COST" : isDirectCost(transaction.category);
}

function transactionIsFinancial(transaction: Transaction) {
  const group = accountGroup(transaction.accountCode);
  return group ? group === "FINANCIAL" : isFinancial(transaction.category);
}

function transactionIsNonOperating(transaction: Transaction) {
  const group = accountGroup(transaction.accountCode);
  return group ? group === "NON_OPERATING" : isNonOperating(transaction.category);
}

function transactionIsInvestment(transaction: Transaction) {
  const group = accountGroup(transaction.accountCode);
  return group ? group === "INVESTMENT" : isInvestment(transaction.category);
}

function transactionIsFinancing(transaction: Transaction) {
  const group = accountGroup(transaction.accountCode);
  return group ? group === "FINANCING" : isFinancing(transaction.category);
}

function transactionIsOperatingIncome(transaction: Transaction) {
  const group = accountGroup(transaction.accountCode);
  if (group) return group === "REVENUE" || group === "OPERATING" || group === "OPERATING_FIXED" || group === "OPERATING_VARIABLE";
  return !isFinancial(transaction.category) && !isNonOperating(transaction.category) && !isInvestment(transaction.category) && !isFinancing(transaction.category);
}

function isVariableExpense(transaction: Transaction) {
  if (transaction.costBehavior === "FIXED") return false;
  if (transaction.costBehavior === "VARIABLE") return true;
  const group = accountGroup(transaction.accountCode);
  if (group === "TAX" || group === "DIRECT_COST" || group === "OPERATING_VARIABLE") return true;
  if (group === "OPERATING_FIXED") return false;
  return (
    isTax(transaction.category) ||
    isDirectCost(transaction.category) ||
    categoryMatches(transaction.category, /comissao|logistica|combustivel|taxa de boleto|meio de pagamento/)
  );
}

function statementTransactions(transactions: Transaction[], report: "DRE" | "DFC") {
  return transactions.filter((transaction) => transaction.status === "CONFIRMED" && reportIncludes(transaction, report));
}

export function calculateFinancials(transactions: Transaction[]): Financials {
  const confirmed = statementTransactions(transactions, "DRE");
  const income = confirmed.filter((transaction) => transaction.kind === "INCOME");
  const expenses = confirmed.filter((transaction) => transaction.kind === "EXPENSE");
  const operatingIncome = income.filter(transactionIsOperatingIncome);
  const operatingExpensesList = expenses.filter(
    (transaction) => !transactionIsTax(transaction) && !transactionIsDirectCost(transaction) && !transactionIsFinancial(transaction) && !transactionIsNonOperating(transaction) && !transactionIsInvestment(transaction) && !transactionIsFinancing(transaction),
  );
  const reportExpenses = expenses.filter((transaction) => !transactionIsInvestment(transaction) && !transactionIsFinancing(transaction));
  const grossRevenue = sum(operatingIncome);
  const taxes = sum(expenses.filter(transactionIsTax));
  const cmv = sum(expenses.filter(transactionIsDirectCost));
  const financialIncome = sum(income.filter(transactionIsFinancial));
  const financialExpense = sum(expenses.filter(transactionIsFinancial));
  const nonOperatingIncome = sum(income.filter(transactionIsNonOperating));
  const nonOperatingExpense = sum(expenses.filter(transactionIsNonOperating));
  const financialResult = financialIncome - financialExpense;
  const nonOperatingResult = nonOperatingIncome - nonOperatingExpense;
  const operationalExpenses = sum(operatingExpensesList);
  const costs = sum(reportExpenses);
  const netRevenue = grossRevenue - taxes;
  const grossProfit = netRevenue - cmv;
  const netProfit = grossProfit - operationalExpenses + financialResult + nonOperatingResult;
  const fixedExpenses = sum(reportExpenses.filter((transaction) => !isVariableExpense(transaction)));
  const variableExpenses = sum(reportExpenses.filter(isVariableExpense));
  const contributionMargin = grossRevenue - variableExpenses;
  const contributionMarginRate = grossRevenue ? contributionMargin / grossRevenue : null;
  const targetProfitMargin = 0.1;
  const breakEvenBase = fixedExpenses - financialIncome - nonOperatingIncome;
  return {
    grossRevenue,
    taxes,
    cmv,
    operationalExpenses,
    netRevenue,
    grossProfit,
    grossMargin: grossRevenue ? grossProfit / grossRevenue : 0,
    costs,
    netProfit,
    netMargin: grossRevenue ? netProfit / grossRevenue : 0,
    financialIncome,
    financialExpense,
    financialResult,
    nonOperatingIncome,
    nonOperatingExpense,
    nonOperatingResult,
    fixedExpenses,
    variableExpenses,
    contributionMargin,
    contributionMarginRate,
    breakEvenRevenue: contributionMarginRate && contributionMarginRate > 0 ? breakEvenBase / contributionMarginRate : null,
    targetProfitMargin,
    targetRevenue:
      contributionMarginRate !== null && contributionMarginRate > targetProfitMargin
        ? breakEvenBase / (contributionMarginRate - targetProfitMargin)
        : null,
    transactionCount: transactions.length,
    pending: transactions.filter((transaction) => transaction.status === "PENDING").length,
  };
}

export function calculateCashFlow(transactions: Transaction[]): CashFlowFinancials {
  const confirmed = statementTransactions(transactions, "DFC");
  const income = confirmed.filter((transaction) => transaction.kind === "INCOME");
  const expenses = confirmed.filter((transaction) => transaction.kind === "EXPENSE");
  const operatingIncome = income.filter(transactionIsOperatingIncome);
  const taxes = sum(expenses.filter(transactionIsTax));
  const cmv = sum(expenses.filter(transactionIsDirectCost));
  const operatingExpenses = sum(
    expenses.filter(
      (transaction) => !transactionIsTax(transaction) && !transactionIsDirectCost(transaction) && !transactionIsFinancial(transaction) && !transactionIsNonOperating(transaction) && !transactionIsInvestment(transaction) && !transactionIsFinancing(transaction),
    ),
  );
  const financialResult = sum(income.filter(transactionIsFinancial)) - sum(expenses.filter(transactionIsFinancial));
  const nonOperating = sum(income.filter(transactionIsNonOperating)) - sum(expenses.filter(transactionIsNonOperating));
  const investments = -sum(expenses.filter(transactionIsInvestment));
  const financing =
    sum(income.filter(transactionIsFinancing)) -
    sum(expenses.filter(transactionIsFinancing));
  const operational = sum(operatingIncome) - taxes - cmv - operatingExpenses + financialResult;
  return { operational, nonOperating, investments, financing, freeCashFlow: operational + nonOperating + investments + financing };
}

export type CashPosition = { openingBalance: number; closingBalance: number };

export function calculateCashPosition(
  transactions: Transaction[],
  period: Period,
  baselineBalance?: number,
  baselineDate?: string,
  reference = new Date(),
): CashPosition | null {
  if (baselineBalance === undefined || !Number.isFinite(baselineBalance) || !baselineDate) return null;
  const periodStart = startOfPeriod(period, reference);
  const periodStartKey = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}-${String(periodStart.getDate()).padStart(2, "0")}`;
  if (baselineDate > periodStartKey) return null;
  const movementsBeforePeriod = transactions.filter((transaction) => {
    const date = transaction.cashDate ?? transaction.date;
    return reportIncludes(transaction, "DFC") && transaction.status === "CONFIRMED" && date >= baselineDate && date < periodStartKey;
  });
  const openingBalance = baselineBalance + calculateCashFlow(movementsBeforePeriod).freeCashFlow;
  const periodFlow = calculateCashFlow(filterByPeriod(transactions, period, reference, "DFC")).freeCashFlow;
  return { openingBalance, closingBalance: openingBalance + periodFlow };
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
      (transaction) => (transaction.competenceDate ?? transaction.date).slice(0, 7) === key && transaction.status === "CONFIRMED" && reportIncludes(transaction, "DRE"),
    );
    const financials = calculateFinancials(scoped);
    const income = financials.grossRevenue;
    const expense = financials.costs;
    points.push({
      label: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      month: key,
      income,
      expense,
      profit: financials.netProfit,
      count: scoped.length,
    });
  }
  return points;
}

export type CategoryTotal = { category: string; amount: number; share: number };

export function categoryBreakdown(transactions: Transaction[], kind: Transaction["kind"]): CategoryTotal[] {
  const scoped = transactions.filter(
    (transaction) =>
      transaction.kind === kind &&
      transaction.status === "CONFIRMED" &&
      reportIncludes(transaction, "DRE") &&
      (kind === "INCOME"
        ? !transactionIsFinancial(transaction) && !transactionIsNonOperating(transaction) && !transactionIsInvestment(transaction) && !transactionIsFinancing(transaction)
        : !transactionIsInvestment(transaction) && !transactionIsFinancing(transaction)),
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
    const date = parseDate(transaction.competenceDate ?? transaction.date);
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
