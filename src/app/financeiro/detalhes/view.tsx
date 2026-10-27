"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CalendarDays, ChevronDown, ChevronUp, ReceiptText } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { AppSelect } from "@/components/ui/app-select";
import {
  PERIOD_LABELS,
  calculateCashFlow,
  calculateFinancials,
  categoryBreakdown,
  classifyCashFlowTransaction,
  classifyDreTransaction,
  dailyFinancialSeries,
  isPeriod,
  type CashFlowBreakdownGroup,
  type CategoryTotal,
  type DreBreakdownGroup,
  type FinancialTimelinePoint,
  type Period,
} from "@/lib/finance";
import { brlExact, shortDate } from "@/lib/format";
import { Donut, type DonutSlice } from "@/components/ui/donut";
import { FinancialPerformanceChart } from "@/components/ui/financial-performance-chart";
import type { Transaction } from "@/lib/types";

type Params = Record<string, string>;
type DetailPayload = { transactions: Transaction[]; availableMonths: string[] };
type DetailReport = "DRE" | "DFC" | "ANY";
type ReportSnapshot = {
  income: number;
  expenses: number;
  result: number;
  margin: number | null;
  incomeLabel: string;
  expensesLabel: string;
  resultLabel: string;
};

const CASH_FLOW_INCOME_GROUPS = new Set<CashFlowBreakdownGroup>([
  "operating-income", "financial-income", "non-operating-income", "financing-income",
]);
const CASH_FLOW_EXPENSE_GROUPS = new Set<CashFlowBreakdownGroup>([
  "tax", "direct", "operating-expense", "financial-expense", "non-operating-expense", "investment-expense", "financing-expense",
]);

const DRE_STAGE_GROUPS: Record<string, DreBreakdownGroup[]> = {
  "gross-revenue": ["revenue"],
  "net-revenue": ["tax"],
  "gross-profit": ["direct"],
  "operating-result": ["operating"],
  "net-profit": ["tax", "direct", "operating", "financial-income", "financial-expense", "non-operating-income", "non-operating-expense"],
};

const DRE_STAGE_LABELS: Record<string, string> = {
  "gross-revenue": "Receita bruta",
  "net-revenue": "Receita líquida",
  "gross-profit": "Lucro bruto",
  "operating-result": "Resultado operacional",
  "net-profit": "Lucro líquido",
};

const METRIC_LABELS: Record<string, string> = {
  revenue: "Receitas do período",
  costs: "Custos e despesas do período",
  profit: "Lançamentos que formam o lucro líquido",
  margin: "Lançamentos que formam a margem líquida",
};

const COST_GROUPS: DreBreakdownGroup[] = ["tax", "direct", "operating", "financial-expense", "non-operating-expense"];
const ALL_DRE_GROUPS: DreBreakdownGroup[] = ["revenue", ...COST_GROUPS, "financial-income", "non-operating-income"];

function metricGroups(metric: string): DreBreakdownGroup[] {
  if (metric === "revenue") return ["revenue"];
  if (metric === "costs") return COST_GROUPS;
  return ALL_DRE_GROUPS;
}

function effectiveDate(transaction: Transaction, report: DetailReport) {
  return report === "DFC"
    ? transaction.cashDate ?? transaction.date
    : transaction.competenceDate ?? transaction.date;
}

function signedAmount(transaction: Transaction) {
  return transaction.kind === "INCOME" ? transaction.amount : -transaction.amount;
}

function categoryLabel(category: string) {
  const normalized = category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (normalized === "cmv") return "CMV";
  if (normalized === "rh") return "RH";
  if (normalized === "administrativa" || normalized === "administrativo") return "Administrativa";
  if (/^(imposto|impostos|tributos?)$/.test(normalized)) return "Impostos";
  if (normalized === "vendas" || normalized === "venda") return "Vendas";
  if (normalized === "outros" || normalized === "outras") return "Outros";
  return category.charAt(0).toLocaleUpperCase("pt-BR") + category.slice(1).toLocaleLowerCase("pt-BR");
}

function isOtherCategory(category: string) {
  return /^(outros?|outras?)$/.test(category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase());
}

function reportExpenseCategories(transactions: Transaction[], report: DetailReport) {
  if (report !== "ANY") return categoryBreakdown(transactions, "EXPENSE", report);
  const expenses = transactions.filter((transaction) => transaction.kind === "EXPENSE" && transaction.status === "CONFIRMED");
  const totals = new Map<string, number>();
  for (const transaction of expenses) totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + transaction.amount);
  const total = expenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount, share: total ? amount / total : 0 }))
    .sort((left, right) => right.amount - left.amount);
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

function previousMonthKey(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const previous = new Date(year, monthNumber - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

function reportSnapshot(transactions: Transaction[], report: DetailReport): ReportSnapshot {
  const confirmed = transactions.filter((transaction) => transaction.status === "CONFIRMED");
  if (report === "DFC") {
    const included = confirmed.map((transaction) => ({ transaction, group: classifyCashFlowTransaction(transaction) }));
    const income = included
      .filter(({ group }) => group !== null && CASH_FLOW_INCOME_GROUPS.has(group))
      .reduce((sum, { transaction }) => sum + transaction.amount, 0);
    const expenses = included
      .filter(({ group }) => group !== null && CASH_FLOW_EXPENSE_GROUPS.has(group))
      .reduce((sum, { transaction }) => sum + transaction.amount, 0);
    return {
      income,
      expenses,
      result: calculateCashFlow(confirmed).freeCashFlow,
      margin: null,
      incomeLabel: "Entradas consideradas",
      expensesLabel: "Saídas consideradas",
      resultLabel: "Caixa líquido",
    };
  }

  const financials = calculateFinancials(confirmed);
  return {
    income: financials.grossRevenue,
    expenses: financials.costs,
    result: financials.netProfit,
    margin: financials.netMargin * 100,
    incomeLabel: "Receita bruta",
    expensesLabel: "Custos e despesas",
    resultLabel: "Lucro líquido",
  };
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function ptPercent(value: number) {
  return `${Math.abs(value).toFixed(1).replace(".", ",")}%`;
}

function ptPoints(value: number) {
  return `${Math.abs(value).toFixed(1).replace(".", ",")} p.p.`;
}

type BridgeStep = {
  label: string;
  formula: string;
  amount: number;
  from: number;
  total: number;
  isBalance?: boolean;
  components: BridgeComponent[];
};

type BridgeCategory = { label: string; amount: number; count: number };
type BridgeComponent = { label: string; amount: number; transactions: Transaction[]; categories: BridgeCategory[] };

const DRE_COMPONENT_LABELS: Record<DreBreakdownGroup, string> = {
  revenue: "Receita operacional",
  tax: "Impostos e tributos",
  direct: "Custos diretos (CMV)",
  operating: "Despesas operacionais",
  "financial-income": "Receitas financeiras",
  "financial-expense": "Despesas financeiras",
  "non-operating-income": "Receitas não operacionais",
  "non-operating-expense": "Despesas não operacionais",
};

const CASH_FLOW_COMPONENT_LABELS: Record<CashFlowBreakdownGroup, string> = {
  "operating-income": "Recebimentos da operação",
  tax: "Impostos e tributos",
  direct: "Custos diretos (CMV)",
  "operating-expense": "Despesas operacionais",
  "financial-income": "Receitas financeiras",
  "financial-expense": "Despesas financeiras",
  "non-operating-income": "Entradas não operacionais",
  "non-operating-expense": "Saídas não operacionais",
  "investment-expense": "Investimentos e ativos",
  "financing-income": "Entradas de financiamento",
  "financing-expense": "Saídas de financiamento",
};

function makeBridgeComponent(label: string, transactions: Transaction[]): BridgeComponent {
  const categories = new Map<string, BridgeCategory>();
  for (const transaction of transactions) {
    const current = categories.get(transaction.category);
    categories.set(transaction.category, {
      label: categoryLabel(transaction.category),
      amount: (current?.amount ?? 0) + signedAmount(transaction),
      count: (current?.count ?? 0) + 1,
    });
  }

  return {
    label,
    amount: transactions.reduce((sum, transaction) => sum + signedAmount(transaction), 0),
    transactions,
    categories: [...categories.values()].sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount)),
  };
}

function dreBridgeComponents(transactions: Transaction[], groups: DreBreakdownGroup[]) {
  return groups
    .map((group) => makeBridgeComponent(DRE_COMPONENT_LABELS[group], transactions.filter((transaction) => classifyDreTransaction(transaction) === group)))
    .filter((component) => component.transactions.length > 0);
}

function cashFlowBridgeComponents(transactions: Transaction[], groups: CashFlowBreakdownGroup[]) {
  return groups
    .map((group) => makeBridgeComponent(CASH_FLOW_COMPONENT_LABELS[group], transactions.filter((transaction) => classifyCashFlowTransaction(transaction) === group)))
    .filter((component) => component.transactions.length > 0);
}

function reportTimeline(transactions: Transaction[], report: DetailReport): FinancialTimelinePoint[] {
  if (report === "DRE") return dailyFinancialSeries(transactions);

  const groups = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const date = effectiveDate(transaction, report);
    const entries = groups.get(date) ?? [];
    entries.push(transaction);
    groups.set(date, entries);
  }

  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, entries]) => {
    const income = entries.filter((entry) => entry.kind === "INCOME").reduce((sum, entry) => sum + entry.amount, 0);
    const expense = entries.filter((entry) => entry.kind === "EXPENSE").reduce((sum, entry) => sum + entry.amount, 0);
    return {
      date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(" de ", " ").replace(".", ""),
      income,
      expense,
      profit: income - expense,
      count: entries.length,
    };
  });
}

function dreBridgeSteps(transactions: Transaction[]): BridgeStep[] {
  const financials = calculateFinancials(transactions);
  const operatingResult = financials.grossProfit - financials.operationalExpenses;
  const afterFinancialResult = operatingResult + financials.financialResult;
  const step = (
    label: string,
    formula: string,
    amount: number,
    from: number,
    total: number,
    groups: DreBreakdownGroup[],
    isBalance = false,
  ): BridgeStep => ({ label, formula, amount, from, total, isBalance, components: dreBridgeComponents(transactions, groups) });
  return [
    step("Receita bruta", "Entradas operacionais antes dos descontos", financials.grossRevenue, 0, financials.grossRevenue, ["revenue"], true),
    step("Impostos", "Reduzem a receita bruta", -financials.taxes, financials.grossRevenue, financials.netRevenue, ["tax"]),
    step("Receita líquida", "Receita bruta − impostos", financials.netRevenue, 0, financials.netRevenue, ["revenue", "tax"], true),
    step("CMV", "Custo diretamente ligado às vendas", -financials.cmv, financials.netRevenue, financials.grossProfit, ["direct"]),
    step("Lucro bruto", "Receita líquida − CMV", financials.grossProfit, 0, financials.grossProfit, ["revenue", "tax", "direct"], true),
    step("Despesas operacionais", "Equipe, RH, vendas e demais despesas da operação", -financials.operationalExpenses, financials.grossProfit, operatingResult, ["operating"]),
    step("Resultado operacional", "Lucro bruto − despesas operacionais", operatingResult, 0, operatingResult, ["revenue", "tax", "direct", "operating"], true),
    step("Resultado financeiro", "Receitas financeiras − despesas financeiras", financials.financialResult, operatingResult, afterFinancialResult, ["financial-income", "financial-expense"]),
    step("Resultado não operacional", "Receitas não operacionais − despesas não operacionais", financials.nonOperatingResult, afterFinancialResult, financials.netProfit, ["non-operating-income", "non-operating-expense"]),
    step("Lucro líquido", "Resultado operacional + resultados financeiros e não operacionais", financials.netProfit, 0, financials.netProfit, ["revenue", "tax", "direct", "operating", "financial-income", "financial-expense", "non-operating-income", "non-operating-expense"], true),
  ];
}

function cashFlowBridgeSteps(transactions: Transaction[]): BridgeStep[] {
  const flow = calculateCashFlow(transactions);
  const afterNonOperating = flow.operational + flow.nonOperating;
  const afterInvestments = afterNonOperating + flow.investments;
  const step = (
    label: string,
    formula: string,
    amount: number,
    from: number,
    total: number,
    groups: CashFlowBreakdownGroup[],
    isBalance = false,
  ): BridgeStep => ({ label, formula, amount, from, total, isBalance, components: cashFlowBridgeComponents(transactions, groups) });
  return [
    step("Fluxo operacional", "Recebimentos e pagamentos da operação", flow.operational, 0, flow.operational, ["operating-income", "tax", "direct", "operating-expense", "financial-income", "financial-expense"], true),
    step("Outras movimentações", "Entradas e saídas não operacionais", flow.nonOperating, flow.operational, afterNonOperating, ["non-operating-income", "non-operating-expense"]),
    step("Investimentos", "Compras e vendas de ativos", flow.investments, afterNonOperating, afterInvestments, ["investment-expense"]),
    step("Financiamentos", "Empréstimos, aportes e pagamentos de dívida", flow.financing, afterInvestments, flow.freeCashFlow, ["financing-income", "financing-expense"]),
    step("Fluxo de caixa do período", "Soma dos fluxos operacionais, não operacionais, investimentos e financiamentos", flow.freeCashFlow, 0, flow.freeCashFlow, ["operating-income", "tax", "direct", "operating-expense", "financial-income", "financial-expense", "non-operating-income", "non-operating-expense", "investment-expense", "financing-income", "financing-expense"], true),
  ];
}

function FinancialBridge({ steps, isLoading, report, periodLaunchCount }: { steps: BridgeStep[]; isLoading: boolean; report: DetailReport; periodLaunchCount: number }) {
  const [expandedStep, setExpandedStep] = useState<string | null>(report === "DFC" ? "Fluxo operacional" : "Receita bruta");
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const maximum = Math.max(1, ...steps.map((step) => Math.abs(step.isBalance ? step.total : step.amount)));
  const zeroPosition = 500;
  const halfTrack = 460;
  const trackStart = zeroPosition - halfTrack;
  const trackEnd = zeroPosition + halfTrack;
  const position = (value: number) => zeroPosition + (value / maximum) * halfTrack;

  return (
    <section className="card financial-detail-bridge">
      <div className="financial-detail-panel-head">
        <div>
          <p className="card-kicker">COMO O RESULTADO FOI FORMADO</p>
          <h2>{isLoading ? "Cálculo do período" : "Da receita ao resultado"}</h2>
          <p>O período reúne {periodLaunchCount} lançamentos confirmados. Cada etapa mostra apenas os lançamentos que entram naquele cálculo.</p>
        </div>
        <span className="financial-detail-bridge-unit">Valores em R$</span>
      </div>
      {isLoading ? <p className="loading">Calculando o relatório...</p> : steps.length ? (
        <>
          <div className="financial-detail-bridge-scale"><span>{brlExact(-maximum)}</span><span>R$ 0</span><span>+ {brlExact(maximum)}</span></div>
          <div className="financial-detail-bridge-legend" aria-label="Legenda dos gráficos">
            <span><i className="is-positive" aria-hidden="true" />Positivo · à direita</span>
            <span><i className="is-negative" aria-hidden="true" />Negativo · à esquerda</span>
          </div>
          <div className="financial-detail-bridge-rows">
            {steps.map((step, stepIndex) => {
              const plottedValue = step.isBalance ? step.total : step.amount;
              const zero = position(0);
              const valuePosition = position(plottedValue);
              const left = Math.min(zero, valuePosition);
              const width = Math.abs(valuePosition - zero);
              const direction = plottedValue < 0 ? "is-negative" : plottedValue > 0 ? "is-positive" : "is-zero";
              const detailId = `financial-bridge-detail-${stepIndex}`;
              const isExpanded = expandedStep === step.label;
              const stepTransactions = [...new Map(
                step.components.flatMap((component) => component.transactions).map((transaction) => [transaction.id, transaction] as const),
              ).values()].sort((leftTransaction, rightTransaction) => effectiveDate(rightTransaction, report).localeCompare(effectiveDate(leftTransaction, report)));
              const visibleStepTransactions = showAllTransactions && isExpanded ? stepTransactions : stepTransactions.slice(0, 5);
              const stepIncomes = stepTransactions.filter((transaction) => transaction.kind === "INCOME").reduce((sum, transaction) => sum + transaction.amount, 0);
              const stepExpenses = stepTransactions.filter((transaction) => transaction.kind === "EXPENSE").reduce((sum, transaction) => sum + transaction.amount, 0);
              const stepTotal = stepTransactions.reduce((sum, transaction) => sum + signedAmount(transaction), 0);
              const classes = [
                "financial-detail-bridge-row",
                direction,
                isExpanded ? "is-expanded" : "",
              ].join(" ");
              return (
                <div className={classes} key={step.label}>
                  <button
                    className="financial-detail-bridge-toggle"
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={stepTransactions.length ? detailId : undefined}
                    aria-label={`${isExpanded ? "Ocultar" : "Ver"} composição de ${step.label}. Valor ${plottedValue < 0 ? "negativo, à esquerda" : plottedValue > 0 ? "positivo, à direita" : "zero"}.`}
                    disabled={!stepTransactions.length}
                    onClick={() => {
                      setExpandedStep((current) => current === step.label ? null : step.label);
                      setShowAllTransactions(false);
                    }}
                  >
                    <span className="financial-detail-bridge-copy">
                      <strong>{step.label}</strong>
                      <span>{step.formula}</span>
                      <small>{stepTransactions.length ? `${stepTransactions.length} ${stepTransactions.length === 1 ? "lançamento nesta etapa" : "lançamentos nesta etapa"} · ${isExpanded ? "Ocultar composição" : "Ver composição"}` : "Sem lançamentos para detalhar"}</small>
                    </span>
                    <svg className="financial-detail-bridge-bar" viewBox="0 0 1000 28" preserveAspectRatio="none" aria-hidden="true">
                      <line x1={trackStart} x2={trackEnd} y1="14" y2="14" className="financial-detail-bridge-axis" />
                      {width > 0 && <rect x={left} y="7" width={width} height="14" rx="7" className={`financial-detail-bridge-segment ${direction}`} />}
                      <line x1={zero} x2={zero} y1="3" y2="25" className="financial-detail-bridge-zero" />
                    </svg>
                    <span className="financial-detail-bridge-value"><strong className={direction}>{brlExact(step.amount)}</strong><span>saldo: {brlExact(step.total)}</span></span>
                    <span className="financial-detail-bridge-chevron" aria-hidden="true">{isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
                  </button>
                  {isExpanded && stepTransactions.length > 0 && (
                    <div className="financial-detail-bridge-detail" id={detailId}>
                      <div className="financial-detail-bridge-metrics">
                        <div><span>Lançamentos da etapa</span><strong>{stepTransactions.length}</strong></div>
                        <div><span>Lançamentos no período</span><strong>{periodLaunchCount}</strong></div>
                        <div><span>Entradas</span><strong className="is-positive">{brlExact(stepIncomes)}</strong></div>
                        <div><span>Saídas</span><strong className="is-negative">{brlExact(stepExpenses)}</strong></div>
                        <div><span>{step.isBalance ? "Resultado acumulado" : "Impacto desta etapa"}</span><strong className={stepTotal < 0 ? "is-negative" : "is-positive"}>{brlExact(stepTotal)}</strong></div>
                      </div>

                      <div className="financial-detail-bridge-equation" aria-label={`Saldo anterior ${brlExact(step.from)}, movimento ${brlExact(step.amount)}, saldo após a etapa ${brlExact(step.total)}`}>
                        <div><span>Saldo anterior</span><strong>{brlExact(step.from)}</strong></div>
                        <span className="financial-detail-bridge-equation-operator">{step.amount < 0 ? "−" : "+"}</span>
                        <div><span>{step.isBalance ? "Valor acumulado" : "Movimento da etapa"}</span><strong className={step.amount < 0 ? "is-negative" : "is-positive"}>{brlExact(Math.abs(step.amount))}</strong></div>
                        <span className="financial-detail-bridge-equation-operator is-equals">=</span>
                        <div><span>Saldo após a etapa</span><strong>{brlExact(step.total)}</strong></div>
                      </div>

                      <div className="financial-detail-bridge-calculation">
                        <div className="financial-detail-bridge-detail-heading">
                          <div><strong>De onde vem esse valor</strong><span>{step.formula} · As barras mostram a participação de cada categoria.</span></div>
                          <span>{step.components.length} {step.components.length === 1 ? "parcela" : "parcelas"}</span>
                        </div>
                        {step.components.map((component) => {
                          const categoryMagnitude = component.categories.reduce((sum, category) => sum + Math.abs(category.amount), 0);
                          return (
                          <article className="financial-detail-bridge-component" key={component.label}>
                            <div className="financial-detail-bridge-component-total">
                              <div><strong>{component.label}</strong><span>{component.transactions.length} {component.transactions.length === 1 ? "lançamento" : "lançamentos"}</span></div>
                              <b className={component.amount < 0 ? "is-negative" : "is-positive"}>{brlExact(component.amount)}</b>
                            </div>
                            <div className="financial-detail-bridge-category-breakdown">
                              {component.categories.map((category) => {
                                const share = categoryMagnitude ? Math.abs(category.amount) / categoryMagnitude * 100 : 0;
                                return (
                                  <div className="financial-detail-bridge-category-row" key={category.label}>
                                    <div><strong>{category.label}</strong><span>{category.count} {category.count === 1 ? "lançamento" : "lançamentos"}</span></div>
                                    <b className={category.amount < 0 ? "is-negative" : "is-positive"}>{brlExact(category.amount)} <small>{share.toFixed(1).replace(".", ",")}%</small></b>
                                    <span className="financial-detail-bridge-category-track" aria-hidden="true"><i className={category.amount < 0 ? "is-negative" : "is-positive"} style={{ width: `${share}%` }} /></span>
                                  </div>
                                );
                              })}
                            </div>
                          </article>
                          );
                        })}
                      </div>

                      <div className="financial-detail-bridge-entries">
                        <div className="financial-detail-bridge-detail-heading">
                          <strong>Lançamentos que compõem esta etapa</strong>
                          <span>{visibleStepTransactions.length} de {stepTransactions.length}</span>
                        </div>
                        <div className="financial-detail-bridge-table-wrap">
                          <table className="financial-detail-bridge-table">
                            <thead><tr><th>Lançamento / favorecido</th><th>Categoria</th><th>Data</th><th className="num">Valor</th></tr></thead>
                            <tbody>
                              {visibleStepTransactions.map((transaction) => {
                                const income = transaction.kind === "INCOME";
                                return (
                                  <tr key={transaction.id}>
                                    <td>
                                      <strong>{transaction.description}</strong>
                                      <span>{transaction.counterparty ? `${income ? "Recebido de" : "Pago para"}: ${transaction.counterparty}` : "Favorecido não informado no lançamento"}{transaction.accountCode ? ` · Conta ${transaction.accountCode}` : ""}</span>
                                    </td>
                                    <td>{categoryLabel(transaction.category)}</td>
                                    <td>{shortDate(effectiveDate(transaction, report))}</td>
                                    <td className={`num ${income ? "is-positive" : "is-negative"}`}>{income ? "+" : "−"} {brlExact(transaction.amount)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {stepTransactions.length > 5 && (
                          <button className="financial-detail-expand financial-detail-bridge-transactions-expand" type="button" onClick={() => setShowAllTransactions((current) => !current)}>
                            {showAllTransactions ? <>Mostrar só os 5 primeiros <ChevronUp size={14} /></> : <>Ver todos os {stepTransactions.length} lançamentos <ChevronDown size={14} /></>}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : <p className="financial-detail-empty-copy">Não há valores confirmados para calcular este período.</p>}
    </section>
  );
}

function FinancialExecutiveReport({
  current,
  previous,
  comparisonMonth,
  biggestExpense,
  expenseTotal,
  previousCategories,
  report,
}: {
  current: ReportSnapshot;
  previous: ReportSnapshot | null;
  comparisonMonth: string | null;
  biggestExpense: CategoryTotal | null;
  expenseTotal: number;
  previousCategories: CategoryTotal[];
  report: "DRE" | "DFC";
}) {
  const incomeChange = previous ? percentageChange(current.income, previous.income) : null;
  const expenseChange = previous ? percentageChange(current.expenses, previous.expenses) : null;
  const resultDelta = previous ? current.result - previous.result : null;
  const marginDelta = previous && current.margin !== null && previous.margin !== null ? current.margin - previous.margin : null;
  const periodLabel = comparisonMonth ? monthLabel(comparisonMonth) : "mês anterior";
  const currencyChangeText = (delta: number | null) => {
    if (delta === null) return comparisonMonth ? "Sem base confirmada no mês anterior" : "Selecione um mês para comparar";
    if (delta > 0) return "Melhorou " + brlExact(delta) + " vs. " + periodLabel;
    if (delta < 0) return "Piorou " + brlExact(Math.abs(delta)) + " vs. " + periodLabel;
    return "Sem variação vs. " + periodLabel;
  };
  const percentChangeText = (change: number | null, value: number, noun: string) => {
    if (change === null) {
      if (!previous) return comparisonMonth ? "Sem base confirmada no mês anterior" : "Selecione um mês para comparar";
      return value > 0 ? noun + " começou neste período" : "Sem " + noun.toLocaleLowerCase("pt-BR") + " nos dois períodos";
    }
    if (Math.abs(change) < 0.05) return noun + " ficou estável vs. " + periodLabel;
    return noun + (change > 0 ? " subiu " : " caiu ") + ptPercent(change) + " vs. " + periodLabel;
  };
  const incomeTone = incomeChange === null || incomeChange === 0 ? "neutral" : incomeChange > 0 ? "positive" : "negative";
  const expenseTone = expenseChange === null || expenseChange === 0 ? "neutral" : expenseChange < 0 ? "positive" : "negative";
  const resultTone = resultDelta === null || resultDelta === 0 ? "neutral" : resultDelta > 0 ? "positive" : "negative";
  const status = current.result < 0 ? "attention" : current.result > 0 ? "positive" : "neutral";
  const statusLabel = current.result < 0 ? "Resultado negativo" : current.result > 0 ? "Resultado positivo" : "Resultado equilibrado";
  const expenseShare = biggestExpense && expenseTotal > 0 ? biggestExpense.amount / expenseTotal : 0;
  const previousBiggestExpense = biggestExpense ? previousCategories.find((entry) => entry.category === biggestExpense.category) : undefined;
  const biggestExpenseDelta = biggestExpense && previous
    ? biggestExpense.amount - (previousBiggestExpense?.amount ?? 0)
    : null;
  const marginLabel = current.margin === null ? null : current.margin.toFixed(1).replace(".", ",") + "%";
  const costShare = current.income > 0 ? current.expenses / current.income : null;
  const reportReading = report === "DFC"
    ? brlExact(current.income) + " em entradas consideradas e " + brlExact(current.expenses) + " em saídas consideradas. O caixa líquido do mês foi " + brlExact(current.result) + "."
    : brlExact(current.income) + " de receita bruta. Custos e despesas consumiram " + (costShare === null ? "—" : (costShare * 100).toFixed(1).replace(".", ",") + "%") + " da receita; o lucro líquido foi " + brlExact(current.result) + (marginLabel ? ", com margem de " + marginLabel : "") + ".";
  const comparisonReading = previous
    ? percentChangeText(incomeChange, current.income, report === "DFC" ? "Entradas" : "Receita") + ". " +
      percentChangeText(expenseChange, current.expenses, report === "DFC" ? "Saídas" : "Custos e despesas") + ". " +
      currencyChangeText(resultDelta) + " no resultado final."
    : comparisonMonth
      ? "Ainda não há lançamentos confirmados em " + periodLabel + " para uma comparação confiável."
      : "Selecione um mês específico para comparar este resultado com o mês anterior.";

  return (
    <section className="card financial-detail-executive" aria-labelledby="financial-detail-executive-title">
      <div className="financial-detail-executive-head">
        <div>
          <p className="card-kicker">LEITURA DO PERÍODO</p>
          <h2 id="financial-detail-executive-title">Resumo executivo</h2>
          <p>{reportReading}</p>
        </div>
        <span className={"financial-detail-executive-status " + status}>{statusLabel}</span>
      </div>

      <div className="financial-detail-executive-metrics" aria-label={"Comparação com " + periodLabel}>
        <article>
          <span>{current.incomeLabel}</span>
          <strong>{brlExact(current.income)}</strong>
          <small className={incomeTone}>{percentChangeText(incomeChange, current.income, report === "DFC" ? "Entradas" : "Receita")}</small>
        </article>
        <article>
          <span>{current.expensesLabel}</span>
          <strong>{brlExact(current.expenses)}</strong>
          <small className={expenseTone}>{percentChangeText(expenseChange, current.expenses, report === "DFC" ? "Saídas" : "Custos e despesas")}</small>
        </article>
        <article>
          <span>{current.resultLabel}</span>
          <strong className={current.result < 0 ? "negative" : "positive"}>{brlExact(current.result)}</strong>
          <small className={resultTone}>
            {currencyChangeText(resultDelta)}
            {marginDelta === null ? "" : " · margem " + (marginDelta > 0 ? "subiu " : marginDelta < 0 ? "caiu " : "ficou estável ") + ptPoints(marginDelta)}
          </small>
        </article>
      </div>

      <div className="financial-detail-executive-reading">
        <div>
          <p className="card-kicker">COMPARAÇÃO</p>
          <p>{comparisonReading}</p>
        </div>
        <aside>
          <p className="card-kicker">ONDE OLHAR PRIMEIRO</p>
          {biggestExpense ? (
            <>
              <strong>{categoryLabel(biggestExpense.category)} · {brlExact(biggestExpense.amount)}</strong>
              <p>
                {ptPercent(expenseShare * 100)} das saídas confirmadas.
                {biggestExpenseDelta === null ? "" : " " + (biggestExpenseDelta > 0 ? "Subiu " : biggestExpenseDelta < 0 ? "Caiu " : "Sem variação ") + brlExact(Math.abs(biggestExpenseDelta)) + " vs. " + periodLabel + "."}
                {current.result < 0
                  ? " Confira os lançamentos dessa categoria para localizar o que mais pressiona o resultado."
                  : " Acompanhe se essa categoria cresce no mesmo ritmo das entradas."}
              </p>
            </>
          ) : <p>Não há saídas confirmadas para identificar uma categoria de maior impacto.</p>}
        </aside>
      </div>

      <p className="financial-detail-executive-note">
        Base: lançamentos confirmados{report === "DRE" ? " por competência" : " pela data de caixa"}. O comparativo usa o mês imediatamente anterior.
      </p>
    </section>
  );
}

function detailsHeading(params: Params) {
  if (params.type === "report") return "Relatório financeiro";
  if (params.type === "dre-stage") return DRE_STAGE_LABELS[params.stage] ?? "Detalhes da DRE";
  if (params.type === "chart-point") return `${METRIC_LABELS[params.metric] ?? "Desempenho"} · ${shortDate(params.date ?? "")}`;
  if (params.type === "expense-category" || params.type === "dre-category") return params.category === "__outros__" ? "Outras categorias" : categoryLabel(params.category ?? "Categoria");
  if (params.type === "cashflow") return "Lançamentos do fluxo de caixa";
  return METRIC_LABELS[params.metric] ?? "Detalhes financeiros";
}

function detailsDescription(params: Params, report: DetailReport) {
  if (params.type === "report") return "Gráficos e cálculos do período, com os lançamentos que formam cada resultado.";
  if (params.type === "dre-stage") return `Lançamentos confirmados que entram em ${DRE_STAGE_LABELS[params.stage] ?? "esta etapa"}.`;
  if (params.type === "chart-point") return `Veja o que formou ${METRIC_LABELS[params.metric]?.toLowerCase() ?? "o resultado"} neste dia.`;
  if (params.type === "expense-category" || params.type === "dre-category") return params.category === "__outros__"
    ? "Categorias fora das cinco maiores, agrupadas em Outros no gráfico."
    : `Lançamentos confirmados classificados como ${categoryLabel(params.category ?? "categoria")}.`;
  if (report === "DFC") return "Cada entrada e saída confirmada que foi liquidada no período selecionado.";
  return `Lançamentos confirmados que compõem ${METRIC_LABELS[params.metric]?.toLowerCase() ?? "o indicador selecionado"}.`;
}

export function FinanceDetailView({ params }: { params: Params }) {
  const router = useRouter();
  const querySignature = JSON.stringify(params);
  const [detailResult, setDetailResult] = useState<{ signature: string; transactions: Transaction[]; previousTransactions: Transaction[]; availableMonths: string[] } | null>(null);
  const [detailError, setDetailError] = useState<{ signature: string; message: string } | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);

  const period: Period = isPeriod(params.period ?? null) ? params.period as Period : "mes";
  const report: DetailReport = params.detailReport === "DFC" || params.detailReport === "ANY" ? params.detailReport : "DRE";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.detailMonth ?? "") ? params.detailMonth : undefined;
  const loadedMonths = detailResult?.signature === querySignature ? detailResult.availableMonths : null;
  const monthOptions = loadedMonths ?? (month ? [month] : []);
  const backParams = new URLSearchParams({ period });
  if (params.chartMonth) backParams.set("chartMonth", params.chartMonth);
  if (params.dreMonth) backParams.set("dreMonth", params.dreMonth);

  function selectMonth(nextMonth: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(nextMonth)) return;
    const nextParams = new URLSearchParams(params);
    nextParams.set("detailMonth", nextMonth);
    nextParams.set("chartMonth", nextMonth);
    router.replace(`/financeiro/detalhes?${nextParams.toString()}`, { scroll: false });
  }

  useEffect(() => {
    if (!month || detailResult?.signature !== querySignature || !detailResult.availableMonths.length || detailResult.availableMonths.includes(month)) return;
    const nextParams = new URLSearchParams(JSON.parse(querySignature) as Params);
    nextParams.set("detailMonth", detailResult.availableMonths[0]);
    nextParams.set("chartMonth", detailResult.availableMonths[0]);
    router.replace(`/financeiro/detalhes?${nextParams.toString()}`, { scroll: false });
  }, [detailResult, month, querySignature, router]);

  useEffect(() => {
    let active = true;
    const currentParams = JSON.parse(querySignature) as Params;
    const currentPeriod = isPeriod(currentParams.period ?? null) ? currentParams.period : "mes";
    const currentReport = currentParams.detailReport === "DFC" || currentParams.detailReport === "ANY" ? currentParams.detailReport : "DRE";
    const currentMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(currentParams.detailMonth ?? "") ? currentParams.detailMonth : undefined;
    const apiParams = new URLSearchParams({ period: currentPeriod, detailReport: currentReport, kind: "todos", category: "todas" });
    if (currentMonth) apiParams.set("detailMonth", currentMonth);

    const previousParams = currentMonth
      ? new URLSearchParams({ period: currentPeriod, detailReport: currentReport, kind: "todos", category: "todas", detailMonth: previousMonthKey(currentMonth) })
      : null;
    const currentRequest = apiFetch<DetailPayload>(`/api/transactions?${apiParams.toString()}`);
    const previousRequest = previousParams
      ? apiFetch<DetailPayload>(`/api/transactions?${previousParams.toString()}`).catch(() => null)
      : Promise.resolve(null);

    Promise.all([currentRequest, previousRequest])
      .then(([payload, previousPayload]) => {
        if (!active) return;
        setDetailResult({
          signature: querySignature,
          transactions: payload.transactions,
          previousTransactions: previousPayload?.transactions ?? [],
          availableMonths: payload.availableMonths ?? [],
        });
      })
      .catch((cause: unknown) => {
        if (active) setDetailError({
          signature: querySignature,
          message: cause instanceof Error ? cause.message : "Não foi possível carregar os lançamentos.",
        });
      });

    return () => { active = false; };
  }, [querySignature]);

  const transactions = detailResult?.signature === querySignature ? detailResult.transactions : null;
  const previousTransactions = detailResult?.signature === querySignature ? detailResult.previousTransactions : [];
  const error = detailError?.signature === querySignature ? detailError.message : "";
  const allTransactions = transactions ?? [];
  const confirmed = allTransactions.filter((transaction) => transaction.status === "CONFIRMED");
  const previousConfirmed = previousTransactions.filter((transaction) => transaction.status === "CONFIRMED");
  let visibleTransactions = confirmed;

  if (params.type === "dre-stage") {
    const groups = DRE_STAGE_GROUPS[params.stage] ?? ALL_DRE_GROUPS;
    visibleTransactions = confirmed.filter((transaction) => {
      const group = classifyDreTransaction(transaction);
      return group !== null && groups.includes(group);
    });
  } else if (params.type === "chart-point") {
    if (report === "DFC") {
      visibleTransactions = confirmed.filter((transaction) => {
        if (effectiveDate(transaction, report) !== params.date) return false;
        if (params.metric === "revenue") return transaction.kind === "INCOME";
        if (params.metric === "costs") return transaction.kind === "EXPENSE";
        return true;
      });
    } else {
      const groups = metricGroups(params.metric ?? "");
      visibleTransactions = confirmed.filter((transaction) => {
        const group = classifyDreTransaction(transaction);
        return effectiveDate(transaction, report) === params.date && group !== null && groups.includes(group);
      });
    }
  } else if (params.type === "metric") {
    const groups = metricGroups(params.metric ?? "");
    visibleTransactions = confirmed.filter((transaction) => {
      const group = classifyDreTransaction(transaction);
      return group !== null && groups.includes(group);
    });
  } else if (params.type === "expense-category" || params.type === "dre-category") {
    if (params.type === "dre-category") {
      visibleTransactions = confirmed.filter((transaction) => {
        if (transaction.category !== params.category) return false;
        if (!params.stage || !DRE_STAGE_GROUPS[params.stage]) return true;
        const group = classifyDreTransaction(transaction);
        return group !== null && DRE_STAGE_GROUPS[params.stage].includes(group);
      });
    } else {
    const expenses = confirmed.filter((transaction) => transaction.kind === "EXPENSE");
    if (params.category === "__outros__") {
      const topCategories = new Set(
        reportExpenseCategories(expenses, report)
          .filter((entry) => !/^(outros?|outras?)$/i.test(entry.category.trim()))
          .slice(0, 5)
          .map((entry) => entry.category),
      );
      visibleTransactions = expenses.filter((transaction) => !topCategories.has(transaction.category));
    } else {
      visibleTransactions = expenses.filter((transaction) => transaction.category === params.category);
      if (params.stage && DRE_STAGE_GROUPS[params.stage]) {
        visibleTransactions = visibleTransactions.filter((transaction) => {
          const group = classifyDreTransaction(transaction);
          return group !== null && DRE_STAGE_GROUPS[params.stage].includes(group);
        });
      }
    }
    }
  }

  visibleTransactions = [...visibleTransactions].sort((left, right) => effectiveDate(right, report).localeCompare(effectiveDate(left, report)));
  const total = visibleTransactions.reduce((sum, transaction) => sum + signedAmount(transaction), 0);
  const allIncomeTotal = visibleTransactions.filter((transaction) => transaction.kind === "INCOME").reduce((sum, transaction) => sum + transaction.amount, 0);
  const allExpenseTotal = visibleTransactions.filter((transaction) => transaction.kind === "EXPENSE").reduce((sum, transaction) => sum + transaction.amount, 0);
  const header = detailsHeading(params);
  const description = detailsDescription(params, report);
  const isLoading = transactions === null && !error;
  const isOverview = params.type === "report";
  const timeline = isOverview ? reportTimeline(confirmed, report) : [];
  const expenseCategories = reportExpenseCategories(confirmed, report);
  const previousExpenseCategories = reportExpenseCategories(previousConfirmed, report);
  const expenseCategoryTotal = expenseCategories.reduce((sum, entry) => sum + entry.amount, 0);
  const topExpenseCategories = expenseCategories.filter((entry) => !isOtherCategory(entry.category)).slice(0, 5);
  const topExpenseCategoryNames = new Set(topExpenseCategories.map((entry) => entry.category));
  const otherExpenseTotal = expenseCategories.filter((entry) => !topExpenseCategoryNames.has(entry.category)).reduce((sum, entry) => sum + entry.amount, 0);
  const categoryColors = ["#f5a623", "#a855f7", "#3b82f6", "#f05269", "#22c58b"];
  const categoryMap = new Map<string, string>();
  const expenseSlices: DonutSlice[] = topExpenseCategories.map((entry, index) => {
    const label = categoryLabel(entry.category);
    categoryMap.set(label, entry.category);
    return { label, value: entry.amount, color: categoryColors[index % categoryColors.length] };
  });
  if (otherExpenseTotal > 0) {
    categoryMap.set("Outros", "__outros__");
    expenseSlices.push({ label: "Outros", value: otherExpenseTotal, color: "#65758b" });
  }
  const expenseRows = showAllCategories
    ? expenseCategories
    : [
      ...topExpenseCategories,
      ...(otherExpenseTotal > 0 ? [{ category: "__outros__", amount: otherExpenseTotal, share: expenseCategoryTotal ? otherExpenseTotal / expenseCategoryTotal : 0 }] : []),
    ];
  const bridgeSteps = confirmed.length === 0 ? [] : report === "DFC" ? cashFlowBridgeSteps(confirmed) : report === "DRE" ? dreBridgeSteps(confirmed) : [];
  const executiveSnapshot = reportSnapshot(confirmed, report);
  const previousSnapshot = previousConfirmed.length ? reportSnapshot(previousConfirmed, report) : null;
  const comparisonMonth = month ? previousMonthKey(month) : null;
  const visibleDetailTransactions = showAllTransactions ? visibleTransactions : visibleTransactions.slice(0, 5);

  function openExpenseCategory(category: string) {
    const nextParams = new URLSearchParams(params);
    nextParams.set("type", "expense-category");
    nextParams.set("category", category);
    router.push(`/financeiro/detalhes?${nextParams.toString()}`, { scroll: false });
  }

  function openChartPoint(date: string, metric: "revenue" | "costs" | "result") {
    const nextParams = new URLSearchParams(params);
    nextParams.set("type", "chart-point");
    nextParams.set("date", date);
    nextParams.set("metric", metric === "result" ? "profit" : metric);
    router.push(`/financeiro/detalhes?${nextParams.toString()}`, { scroll: false });
  }

  return (
    <div className="page-wrap financial-detail-page">
      <Link className="finance-back-link" href={`/financeiro?${backParams.toString()}`}>
        <ArrowLeft size={16} /> Voltar para o relatório
      </Link>

      <header className="financial-detail-head">
        <div className="financial-detail-title-icon" aria-hidden="true"><ReceiptText size={21} /></div>
        <div>
          <p className="card-kicker">DETALHAMENTO FINANCEIRO</p>
          <h1 className="page-title">{header}</h1>
          <p className="subtitle">{description}</p>
        </div>
        <div className="financial-detail-period">
          <CalendarDays size={15} />
          {month ? (
            loadedMonths?.length === 0 ? (
              <span className="financial-detail-period-empty">Sem meses com lançamentos</span>
            ) : (
              <AppSelect aria-label="Mês do detalhamento" value={month} onChange={(event) => selectMonth(event.target.value)}>
                {monthOptions.map((monthOption) => <option key={monthOption} value={monthOption}>{monthLabel(monthOption)}</option>)}
              </AppSelect>
            )
          ) : (
            <AppSelect aria-label="Período dos detalhes" value={period} onChange={(event) => {
              const nextParams = new URLSearchParams(params);
              nextParams.set("period", event.target.value);
              window.location.href = `/financeiro/detalhes?${nextParams.toString()}`;
            }}>
              {Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </AppSelect>
          )}
        </div>
      </header>

      <section className="financial-detail-summary" aria-label="Resumo dos lançamentos exibidos">
        <div>
          <span>Lançamentos</span>
          <strong>{isLoading ? "—" : visibleTransactions.length}</strong>
        </div>
        <div>
          <span>Total de entradas</span>
          <strong className="is-positive">{isLoading ? "—" : brlExact(allIncomeTotal)}</strong>
        </div>
        <div>
          <span>Total de saídas</span>
          <strong className="is-negative">{isLoading ? "—" : brlExact(allExpenseTotal)}</strong>
        </div>
        <div>
          <span>Saldo líquido</span>
          <strong className={total < 0 ? "is-negative" : "is-positive"}>{isLoading ? "—" : brlExact(total)}</strong>
        </div>
      </section>

      {isOverview && report !== "ANY" && !isLoading && !error && (
        <FinancialExecutiveReport
          current={executiveSnapshot}
          previous={previousSnapshot}
          comparisonMonth={comparisonMonth}
          biggestExpense={expenseCategories[0] ?? null}
          expenseTotal={expenseCategoryTotal}
          previousCategories={previousExpenseCategories}
          report={report}
        />
      )}

      {isOverview && (
        <section className="financial-detail-dashboard" aria-label="Análises do relatório financeiro">
          <section className="card financial-detail-panel financial-detail-performance">
            <div className="financial-detail-panel-head">
              <div>
                <p className="card-kicker">MOVIMENTAÇÃO DO PERÍODO</p>
                <h2>Receita, saídas e resultado</h2>
                <p>Selecione uma curva e um dia do gráfico para abrir os lançamentos que formaram o valor.</p>
              </div>
              <span className="financial-detail-chart-period">{month ? monthLabel(month) : PERIOD_LABELS[period]}</span>
            </div>
            {isLoading ? <p className="loading">Carregando a evolução do período...</p> : (
              <FinancialPerformanceChart points={timeline} height={250} onPointClick={openChartPoint} />
            )}
          </section>

          <section className="card financial-detail-panel financial-detail-expenses">
            <div className="financial-detail-panel-head">
              <div>
                <p className="card-kicker">COMPOSIÇÃO DAS SAÍDAS</p>
                <h2>Para onde vai o dinheiro</h2>
                <p>As cinco maiores categorias aparecem separadas; o restante fica em Outros.</p>
              </div>
            </div>
            {isLoading ? <p className="loading">Calculando as categorias...</p> : expenseSlices.length ? (
              <>
                <Donut
                  slices={expenseSlices}
                  centerLabel="Total de saídas"
                  centerValue={brlExact(expenseCategoryTotal)}
                  size={142}
                  formatValue={brlExact}
                  onSliceClick={(label) => openExpenseCategory(categoryMap.get(label) ?? "__outros__")}
                />
                <div className="financial-detail-category-list">
                  {expenseRows.map((entry) => {
                    const isOther = entry.category === "__outros__" || isOtherCategory(entry.category);
                    const label = isOther ? "Outros" : categoryLabel(entry.category);
                    return (
                      <button className="financial-detail-category-row" key={entry.category} type="button" onClick={() => openExpenseCategory(isOther ? "__outros__" : entry.category)}>
                        <span><i aria-hidden="true" />{label}</span>
                        <strong>{brlExact(entry.amount)}</strong>
                        <em>{expenseCategoryTotal ? `${((entry.amount / expenseCategoryTotal) * 100).toFixed(1).replace(".", ",")}%` : "0%"}</em>
                      </button>
                    );
                  })}
                </div>
                {expenseCategories.length > 5 && (
                  <button className="financial-detail-expand" type="button" onClick={() => setShowAllCategories((current) => !current)}>
                    {showAllCategories ? <>Mostrar só as principais <ChevronUp size={14} /></> : <>Ver todas as {expenseCategories.length} categorias <ChevronDown size={14} /></>}
                  </button>
                )}
              </>
            ) : <p className="financial-detail-empty-copy">Não há saídas confirmadas para compor este gráfico.</p>}
          </section>

          {report !== "ANY" && <FinancialBridge key={`${report}:${month ?? period}`} steps={bridgeSteps} isLoading={isLoading} report={report} periodLaunchCount={visibleTransactions.length} />}
        </section>
      )}

      <section className="card financial-detail-list">
        <div className="financial-detail-list-head">
          <div>
            <h2>{isOverview ? "Lançamentos do período" : "Itens que formam este resultado"}</h2>
            <p>{isOverview ? "Entradas e saídas confirmadas, com descrição, favorecido, categoria, data e valor." : "Cada lançamento aparece separadamente, com descrição, favorecido, categoria, data e valor."}</p>
          </div>
          <ArrowUpRight size={18} aria-hidden="true" />
        </div>

        {error ? <p className="form-error">{error}</p> : isLoading ? <p className="loading">Carregando lançamentos...</p> : visibleTransactions.length ? (
          <div className="financial-detail-table-wrap">
            <table className="financial-detail-table">
              <thead>
                <tr><th>Lançamento / favorecido</th><th>Categoria</th><th>Data</th><th>Relatório</th><th className="num">Valor</th></tr>
              </thead>
              <tbody>
                {visibleDetailTransactions.map((transaction) => {
                  const date = effectiveDate(transaction, report);
                  const isIncome = transaction.kind === "INCOME";
                  return (
                    <tr key={transaction.id}>
                      <td>
                        <strong>{transaction.description}</strong>
                        <span className="financial-detail-counterparty">
                          {transaction.counterparty ? `${isIncome ? "Recebido de" : "Para"}: ${transaction.counterparty}` : "Favorecido não informado no lançamento"}
                        </span>
                      </td>
                      <td><span className="financial-detail-category">{categoryLabel(transaction.category)}</span></td>
                      <td>{shortDate(date)}{transaction.cashDate && report === "DRE" && <span className="financial-detail-counterparty">Caixa: {shortDate(transaction.cashDate)}</span>}</td>
                      <td>{transaction.financialReport === "DFC" ? "Caixa" : transaction.financialReport === "DRE" ? "DRE" : "DRE e caixa"}</td>
                      <td className={`num ${isIncome ? "is-positive" : "is-negative"}`}>{isIncome ? "+" : "−"} {brlExact(transaction.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="financial-detail-empty">
            <ReceiptText size={22} />
            <strong>Nenhum lançamento para mostrar</strong>
            <span>Não há lançamentos confirmados nesta etapa e período.</span>
          </div>
        )}

        {!isLoading && visibleTransactions.length > 5 && (
          <button className="financial-detail-expand financial-detail-transactions-expand" type="button" onClick={() => setShowAllTransactions((current) => !current)}>
            {showAllTransactions ? <>Mostrar só os primeiros 5 <ChevronUp size={14} /></> : <>Mostrar todos os {visibleTransactions.length} lançamentos <ChevronDown size={14} /></>}
          </button>
        )}

        {!isLoading && visibleTransactions.length > 0 && visibleTransactions.some((transaction) => !transaction.counterparty) && (
          <p className="financial-detail-note">Os registros antigos não têm um campo separado de favorecido. Informe cliente ou fornecedor ao cadastrar novos lançamentos para preencher esse detalhe.</p>
        )}
      </section>
    </div>
  );
}
