"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AppSelect } from "@/components/ui/app-select";
import {
  BadgeDollarSign,
  CalendarDays,
  Check,
  Coins,
  FileSpreadsheet,
  FileText,
  Upload,
  Plus,
  Receipt,
  Repeat,
  SlidersHorizontal,
  TrendingUp,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Donut } from "@/components/ui/donut";
import { FinancialPerformanceChart } from "@/components/ui/financial-performance-chart";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useAutoRevalidate, useResource } from "@/lib/client";
import {
  PERIOD_LABELS,
  type CashPosition,
  type CashFlowFinancials,
  type CategoryTotal,
  type DreBreakdownGroup,
  type DreBreakdownTotal,
  type FinancialTimelinePoint,
  type Financials,
  type MonthlyPoint,
  type Period,
} from "@/lib/finance";
import { brl, brlExact, compactBrl, percent, shortDate, signedPercent } from "@/lib/format";
import type { Transaction } from "@/lib/types";

type Payload = {
  period: Period;
  transactions: Transaction[];
  financials: Financials;
  cashFlow: CashFlowFinancials;
  cashPosition: CashPosition | null;
  dreCashFlow: CashFlowFinancials | null;
  dreCashPosition: CashPosition | null;
  comparison: { revenue: number; costs: number; profit: number };
  categories: string[];
  series: MonthlyPoint[];
  performanceSeries: FinancialTimelinePoint[];
  incomeByCategory: CategoryTotal[];
  expensesByCategory: CategoryTotal[];
  dreMonth: string;
  dreMonths: string[];
  dreFinancials: Financials;
  dreBreakdown: DreBreakdownTotal[];
  automated: number;
};

type PdfAnalysis = { summary: { grossRevenue: number; taxes: number; netRevenue: number; cmv: number; grossProfit: number; operatingExpenses: number; financialIncome: number; financialExpense: number; nonOperatingIncome: number; nonOperatingExpense: number; investments: number; financingIn: number; financingOut: number; netProfit: number; grossMargin: number | null; netMargin: number | null; operationalCashFlow: number | null; freeCashFlow: number | null; projectedFixedOutflow: number }; warnings: string[] };
type ImportTransaction = Pick<Transaction, "date" | "description" | "amount" | "kind" | "category" | "financialReport" | "competenceDate" | "cashDate" | "costBehavior">;
type ImportPreview = { transactions?: ImportTransaction[]; analysis?: PdfAnalysis };

const IMPORT_BATCH_SIZE = 500;
const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;
const IMPORT_EXTENSIONS = new Set(["pdf", "xlsx", "xls", "csv", "docx"]);
const IMPORT_PREVIEW_PAGE_SIZE = 25;

async function importChunkIds(file: File, chunkCount: number) {
  if (!chunkCount) return [];
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  const fileHash = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return Promise.all(Array.from({ length: chunkCount }, async (_, index) => {
    const input = new TextEncoder().encode(`${fileHash}:${index}`);
    const hash = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", input));
    return [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }));
}

type FinanceSectionId = "summary" | "charts" | "dre" | "cashflow" | "transactions";

const FINANCE_SECTIONS: Array<{ id: FinanceSectionId; label: string }> = [
  { id: "summary", label: "Indicadores principais" },
  { id: "charts", label: "Gráficos do período" },
  { id: "dre", label: "DRE e indicadores" },
  { id: "cashflow", label: "Fluxo de caixa e metas" },
  { id: "transactions", label: "Lançamentos" },
];

const DEFAULT_FINANCE_SECTIONS = FINANCE_SECTIONS.map(({ id }) => id);

function readFinanceSections(): Set<FinanceSectionId> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem("behemoth-finance-sections") ?? "null");
    if (!Array.isArray(stored)) return new Set(DEFAULT_FINANCE_SECTIONS);
    return new Set(stored.filter((value): value is FinanceSectionId =>
      FINANCE_SECTIONS.some((section) => section.id === value),
    ));
  } catch {
    return new Set(DEFAULT_FINANCE_SECTIONS);
  }
}

const EMPTY_FORM = {
  description: "",
  amount: "",
  kind: "INCOME" as Transaction["kind"],
  category: "",
  date: new Date().toISOString().slice(0, 10),
  cashDate: "",
  financialReport: "DRE" as NonNullable<Transaction["financialReport"]>,
  costBehavior: "AUTO" as NonNullable<Transaction["costBehavior"]>,
  status: "CONFIRMED" as Transaction["status"],
  recurrence: "NONE" as NonNullable<Transaction["recurrence"]>,
};

const EXPENSE_PALETTE = ["#f97316", "#e95469", "#a855f7", "#2997f5", "#14b87a", "#f5a524"];

function expenseCategoryColor(category: string, index: number) {
  const normalized = category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/imposto|tribut|simples|icms|iss\b|pis\b|cofins/.test(normalized)) return "#e95469";
  if (/cmv|custo|fornecedor|insumo|compra/.test(normalized)) return "#f5a524";
  if (/salario|folha|equipe|rh\b/.test(normalized)) return "#a855f7";
  if (/marketing|comissao|frete|vendas?/.test(normalized)) return "#f97316";
  if (/aluguel|energia|internet|administrativ/.test(normalized)) return "#2997f5";
  return EXPENSE_PALETTE[index % EXPENSE_PALETTE.length];
}

function signedBrl(value: number) {
  return `${value < 0 ? "−" : "+"} ${brlExact(Math.abs(value))}`;
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDreMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

type DreStageId = "gross-revenue" | "net-revenue" | "gross-profit" | "operating-result" | "net-profit";
type DreDetailItem = { id: string; label: string; note: string; value: number };
type DreStageDefinition = {
  id: DreStageId;
  label: string;
  chartLines: [string, string];
  description: string;
  formula: string;
  detailTitle: string;
  detailHeading: string;
};

const DRE_STAGE_DEFINITIONS: DreStageDefinition[] = [
  {
    id: "gross-revenue",
    label: "Receita bruta",
    chartLines: ["Receita", "bruta"],
    description: "Soma das receitas operacionais confirmadas no período, antes dos impostos e custos.",
    formula: "Soma das receitas classificadas para a DRE",
    detailTitle: "O que formou o faturamento",
    detailHeading: "Receitas do período",
  },
  {
    id: "net-revenue",
    label: "Receita líquida",
    chartLines: ["Receita", "líquida"],
    description: "Mostra quanto da receita permanece depois dos impostos sobre vendas e serviços.",
    formula: "Receita bruta − impostos sobre a receita",
    detailTitle: "Impostos sobre a receita",
    detailHeading: "O que foi descontado",
  },
  {
    id: "gross-profit",
    label: "Lucro bruto",
    chartLines: ["Lucro", "bruto"],
    description: "Indica o valor que sobra depois dos custos diretamente ligados ao que foi vendido.",
    formula: "Receita líquida − CMV e custos diretos",
    detailTitle: "Custos ligados às vendas",
    detailHeading: "CMV e custos variáveis",
  },
  {
    id: "operating-result",
    label: "Resultado operacional",
    chartLines: ["Resultado", "operacional"],
    description: "Mostra o resultado da atividade após os gastos necessários para manter a operação.",
    formula: "Lucro bruto − despesas operacionais",
    detailTitle: "Despesas da operação",
    detailHeading: "O que mantém a operação",
  },
  {
    id: "net-profit",
    label: "Lucro líquido",
    chartLines: ["Lucro", "líquido"],
    description: "É o resultado final depois dos custos, despesas e resultados financeiros e não operacionais.",
    formula: "Resultado operacional + resultado financeiro + resultado não operacional",
    detailTitle: "O que saiu do faturamento",
    detailHeading: "Composição do resultado",
  },
];

function dreBreakdownNote(group: DreBreakdownGroup) {
  if (group === "revenue") return "Receita operacional que compõe o faturamento";
  if (group === "tax") return "Tributo sobre vendas ou serviços";
  if (group === "direct") return "Custo diretamente ligado à venda";
  if (group === "financial-income") return "Juros, tarifas ou rendimentos financeiros recebidos";
  if (group === "financial-expense") return "Juros ou tarifas financeiras pagas";
  if (group === "non-operating-income") return "Receita fora da atividade principal";
  if (group === "non-operating-expense") return "Despesa fora da atividade principal";
  return "Despesa necessária para a operação";
}

function dreDetailItems(
  stageId: DreStageId,
  breakdown: DreBreakdownTotal[],
  financials?: Financials,
): DreDetailItem[] {
  const categoryRows = (groups: DreBreakdownGroup[], fallback?: DreDetailItem) => {
    const rows = breakdown
      .filter((entry) => groups.includes(entry.group))
      .map((entry) => ({
        id: `${entry.group}:${entry.category}`,
        label: entry.category,
        note: dreBreakdownNote(entry.group),
        value: entry.group.endsWith("income") || entry.group === "revenue" ? entry.amount : -entry.amount,
      }));
    return rows.length || !fallback ? rows : [fallback];
  };

  if (stageId === "gross-revenue") return categoryRows(["revenue"], financials?.grossRevenue ? {
    id: "revenue:period",
    label: "Receitas do período",
    note: "Receitas operacionais confirmadas",
    value: financials.grossRevenue,
  } : undefined);
  if (stageId === "net-revenue") {
    return categoryRows(["tax"], financials?.taxes ? {
      id: "tax:total",
      label: "Impostos sobre a receita",
      note: "Tributos descontados do faturamento",
      value: -financials.taxes,
    } : undefined);
  }
  if (stageId === "gross-profit") {
    return categoryRows(["direct"], financials?.cmv ? {
      id: "direct:total",
      label: "CMV e custos diretos",
      note: "Custos ligados ao que foi vendido",
      value: -financials.cmv,
    } : undefined);
  }
  if (stageId === "operating-result") {
    return categoryRows(["operating"], financials?.operationalExpenses ? {
      id: "operating:total",
      label: "Despesas operacionais",
      note: "Gastos necessários para manter a operação",
      value: -financials.operationalExpenses,
    } : undefined);
  }

  return categoryRows([
    "tax",
    "direct",
    "operating",
    "financial-income",
    "financial-expense",
    "non-operating-income",
    "non-operating-expense",
  ]);
}

function selectDreStageWithKeyboard(event: KeyboardEvent<SVGGElement>, stageId: DreStageId, select: (value: DreStageId) => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  select(stageId);
}

export default function FinanceiroPage() {
  const [period, setPeriod] = useState<Period>("mes");
  const [dreMonth, setDreMonth] = useState(currentMonthValue);
  const [selectedDreStep, setSelectedDreStep] = useState<DreStageId>("net-profit");
  const [visibleSections, setVisibleSections] = useState<Set<FinanceSectionId>>(() => new Set(DEFAULT_FINANCE_SECTIONS));
  const [kind, setKind] = useState("todos");
  const [category, setCategory] = useState("todas");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"report" | "pdf">("report");
  const importDialogRef = useRef<HTMLDialogElement>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [processingPdf, setProcessingPdf] = useState(false);
  const [pdfReadDone, setPdfReadDone] = useState(false);
  const [savingImport, setSavingImport] = useState(false);
  const [pdfImportDone, setPdfImportDone] = useState(false);
  const [pdfTransactions, setPdfTransactions] = useState<ImportTransaction[]>([]);
  const [importPage, setImportPage] = useState(0);
  const [importIds, setImportIds] = useState<string[]>([]);
  const [completedImportChunks, setCompletedImportChunks] = useState(0);
  const [pdfAnalysis, setPdfAnalysis] = useState<PdfAnalysis | null>(null);
  const [importError, setImportError] = useState("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const notify = useToast();

  useEffect(() => {
    setVisibleSections(readFinanceSections());
  }, []);

  useEffect(() => {
    const dialog = importDialogRef.current;
    if (!dialog) return;

    if (activeTab === "pdf" && !dialog.open) dialog.showModal();
    if (activeTab === "report" && dialog.open) dialog.close();
  }, [activeTab]);

  function toggleFinanceSection(id: FinanceSectionId) {
    const next = new Set(visibleSections);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setVisibleSections(next);
    try {
      window.localStorage.setItem("behemoth-finance-sections", JSON.stringify([...next]));
    } catch {
      // A visão continua utilizável quando o navegador bloqueia o armazenamento local.
    }
  }

  const { data, loading, error } = useResource<Payload>(
    `/api/transactions?period=${period}&dreMonth=${dreMonth}&kind=${kind}&category=${encodeURIComponent(category)}`,
  );
  useAutoRevalidate();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("novo")) setFormOpen(true);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/api/transactions", {
        method: "POST",
        body: JSON.stringify({ ...form, cashDate: form.cashDate || undefined }),
      });
      notify("Lançamento salvo.", "success");
      setForm({ ...EMPTY_FORM, kind: form.kind });
      setFormOpen(false);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao salvar.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function processFinancialFile(fileToProcess = pdfFile) {
    if (!fileToProcess) return;
    setProcessingPdf(true);
    setPdfReadDone(false);
    setPdfImportDone(false);
    setPdfTransactions([]);
    setImportPage(0);
    setImportIds([]);
    setCompletedImportChunks(0);
    setPdfAnalysis(null);
    setImportError("");
    try {
      const body = new FormData();
      body.append("file", fileToProcess);
      const payload = await apiFetch<ImportPreview>("/api/finance/pdf", { method: "POST", body });
      const extracted = payload.transactions ?? [];
      const batches = Math.ceil(extracted.length / IMPORT_BATCH_SIZE);
      const identifiers = await importChunkIds(fileToProcess, batches);
      setPdfTransactions(extracted);
      setImportIds(identifiers);
      setCompletedImportChunks(0);
      setPdfAnalysis(payload.analysis ?? null);
      setPdfReadDone(true);
      notify(extracted.length ? `${extracted.length} lançamento(s) encontrados. Confira a prévia e confirme a importação.` : "O arquivo foi lido, mas não tem lançamentos detalhados com data para importar.", extracted.length ? "success" : "error");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Erro ao ler o arquivo.";
      setImportError(message);
      notify(message, "error");
    } finally {
      setProcessingPdf(false);
    }
  }

  function clearImportPreview() {
    setPdfFile(null);
    setPdfTransactions([]);
    setImportPage(0);
    setImportIds([]);
    setCompletedImportChunks(0);
    setPdfAnalysis(null);
    setPdfReadDone(false);
    setPdfImportDone(false);
    setImportError("");
  }

  function chooseFinancialFile(file: File | undefined) {
    if (!file) return;
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    if (!IMPORT_EXTENSIONS.has(extension)) {
      notify("Envie um PDF, Excel (.xlsx/.xls), CSV ou Word (.docx).", "error");
      return;
    }
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      notify("O arquivo deve ter no máximo 10 MB.", "error");
      return;
    }
    setPdfFile(file);
    setPdfTransactions([]);
    setImportPage(0);
    setImportIds([]);
    setCompletedImportChunks(0);
    setPdfAnalysis(null);
    setPdfImportDone(false);
    setImportError("");
    void processFinancialFile(file);
  }

  async function confirmImport() {
    if (!pdfTransactions.length || pdfImportDone) return;
    if (importNeedsCashDate) {
      notify("Informe a data de liquidação dos lançamentos marcados para DRE e caixa.", "error");
      return;
    }
    if (importHasInvalidRows) {
      notify("Revise a descrição e o valor de todos os lançamentos antes de importar.", "error");
      return;
    }
    setSavingImport(true);
    let saved = completedImportChunks * IMPORT_BATCH_SIZE;
    const extension = pdfFile?.name.toLowerCase().split(".").pop();
    const source = extension === "xlsx" || extension === "xls" ? "Excel" : extension === "csv" ? "CSV" : extension === "docx" ? "Word" : "PDF";
    try {
      const totalChunks = Math.ceil(pdfTransactions.length / IMPORT_BATCH_SIZE);
      for (let chunkIndex = completedImportChunks; chunkIndex < totalChunks; chunkIndex += 1) {
        const batch = pdfTransactions.slice(chunkIndex * IMPORT_BATCH_SIZE, (chunkIndex + 1) * IMPORT_BATCH_SIZE);
        await apiFetch("/api/transactions/import", {
          method: "POST",
          body: JSON.stringify({
            importId: importIds[chunkIndex],
            transactions: batch.map((item) => ({ ...item, status: "CONFIRMED", source })),
          }),
        });
        saved += batch.length;
        setCompletedImportChunks(chunkIndex + 1);
      }
      setPdfImportDone(true);
      notify(`${saved} lançamento(s) adicionados ao relatório financeiro.`, "success");
    } catch (cause) {
      notify(saved > 0
        ? `${saved} lançamento(s) foram salvos. Ainda restam ${pdfTransactions.length - saved} para importar; você pode continuar sem duplicar os já salvos.`
        : cause instanceof Error ? cause.message : "Não foi possível salvar os lançamentos.", "error");
    } finally {
      setSavingImport(false);
    }
  }

  function updateImportTransaction(index: number, changes: Partial<ImportTransaction>) {
    setPdfTransactions((current) => current.map((transaction, itemIndex) =>
      itemIndex === index ? { ...transaction, ...changes } : transaction,
    ));
  }

  async function toggleStatus(transaction: Transaction) {
    try {
      await apiFetch(`/api/transactions/${transaction.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: transaction.status === "CONFIRMED" ? "PENDING" : "CONFIRMED" }),
      });
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao atualizar.", "error");
    }
  }

  async function remove(transaction: Transaction) {
    if (!window.confirm(`Excluir "${transaction.description}"?`)) return;
    try {
      await apiFetch(`/api/transactions/${transaction.id}`, { method: "DELETE" });
      notify("Lançamento excluído.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao excluir.", "error");
    }
  }

  const financials = data?.financials;
  const dreFinancials = data?.dreFinancials ?? financials;
  const cashFlow = data?.cashFlow;
  const dreCashFlow = data?.dreCashFlow;
  const dreCashPosition = data?.dreCashPosition;
  const revenue = financials?.grossRevenue ?? 0;
  const costs = financials?.costs ?? 0;
  const margin = (financials?.netMargin ?? 0) * 100;
  const dreRevenue = dreFinancials?.grossRevenue ?? 0;
  const dreMargin = (dreFinancials?.netMargin ?? 0) * 100;
  const dreCostIndex = dreRevenue ? ((dreFinancials?.costs ?? 0) / dreRevenue) * 100 : 0;
  const dreMonthOptions = data?.dreMonths?.length ? data.dreMonths : [dreMonth];
  const dreValues: Record<DreStageId, number> = {
    "gross-revenue": dreRevenue,
    "net-revenue": dreFinancials?.netRevenue ?? 0,
    "gross-profit": dreFinancials?.grossProfit ?? 0,
    "operating-result": (dreFinancials?.grossProfit ?? 0) - (dreFinancials?.operationalExpenses ?? 0),
    "net-profit": dreFinancials?.netProfit ?? 0,
  };
  const dreStages = DRE_STAGE_DEFINITIONS.map((definition) => ({ ...definition, value: dreValues[definition.id] }));
  const selectedDreStage = dreStages.find((stage) => stage.id === selectedDreStep) ?? dreStages[dreStages.length - 1];
  const selectedDreItems = dreDetailItems(
    selectedDreStep,
    data?.dreBreakdown ?? [],
    dreFinancials,
  );
  const chartMaxPositive = Math.max(0, ...dreStages.map((stage) => stage.value));
  const chartMaxNegative = Math.max(0, ...dreStages.map((stage) => Math.abs(Math.min(stage.value, 0))));
  const chartScaleTotal = chartMaxPositive + chartMaxNegative;
  const chartPositiveRatio = chartScaleTotal ? chartMaxPositive / chartScaleTotal : 1;
  const chartTop = 42;
  const chartPlotHeight = 178;
  const chartZeroY = chartTop + chartPlotHeight * chartPositiveRatio;
  const chartPositiveHeight = chartPlotHeight * chartPositiveRatio;
  const chartNegativeHeight = chartPlotHeight - chartPositiveHeight;
  const chartCenters = [148, 293, 438, 583, 728];
  const chartTicks = chartMaxPositive > 0 ? [1, 0.75, 0.5, 0.25, 0] : [0];
  const chartStageGeometry = dreStages.map((stage, index) => {
    const center = chartCenters[index] ?? 0;
    const barHeight = stage.value > 0 && chartMaxPositive
      ? (stage.value / chartMaxPositive) * chartPositiveHeight
      : stage.value < 0 && chartMaxNegative
        ? (Math.abs(stage.value) / chartMaxNegative) * chartNegativeHeight
        : 0;
    const barY = stage.value < 0 ? chartZeroY : chartZeroY - barHeight;
    const valueY = stage.value < 0
      ? Math.min(chartTop + chartPlotHeight + 18, barY + barHeight + 17)
      : Math.max(18, barY - 12);
    return { ...stage, center, barHeight, barY, valueY };
  });
  const selectedDreShare = dreRevenue ? (selectedDreStage.value / dreRevenue) * 100 : null;
  const importBatchCount = Math.ceil(pdfTransactions.length / IMPORT_BATCH_SIZE);
  const importProgress = importBatchCount ? Math.round((completedImportChunks / importBatchCount) * 100) : 0;
  const importPreviewPageCount = Math.ceil(pdfTransactions.length / IMPORT_PREVIEW_PAGE_SIZE);
  const importPreviewStart = importPage * IMPORT_PREVIEW_PAGE_SIZE;
  const visibleImportTransactions = pdfTransactions.slice(importPreviewStart, importPreviewStart + IMPORT_PREVIEW_PAGE_SIZE);
  const importNeedsCashDate = pdfTransactions.some((item) => item.financialReport === "BOTH" && !item.cashDate);
  const importHasInvalidRows = pdfTransactions.some((item) => !item.description.trim() || !Number.isFinite(item.amount) || item.amount <= 0);
  const importFileExtension = pdfFile?.name.toLowerCase().split(".").pop();
  const importFileSize = pdfFile
    ? pdfFile.size < 1024 * 1024
      ? `${Math.max(1, Math.round(pdfFile.size / 1024))} KB`
      : `${(pdfFile.size / (1024 * 1024)).toFixed(1)} MB`
    : "";
  const importFileState = savingImport
    ? "Importando"
    : processingPdf
      ? "Lendo arquivo"
      : pdfImportDone
        ? "Concluído"
        : importError
          ? "Falha na leitura"
          : pdfReadDone
            ? "Leitura concluída"
            : "Selecionado";
  const importFileDetail = savingImport
    ? `${importProgress}% dos lançamentos salvos`
    : processingPdf
      ? "Organizando os dados para a prévia"
      : pdfImportDone
        ? "Lançamentos adicionados ao relatório"
        : importError
          ? "Confira a mensagem abaixo"
          : pdfReadDone
            ? pdfTransactions.length
              ? `${pdfTransactions.length} lançamento(s) encontrados · revise abaixo`
              : "Nenhum lançamento detalhado encontrado"
            : "A leitura começará em instantes";
  const importFileStateClass = savingImport || processingPdf
    ? "is-processing"
    : importError
      ? "is-error"
      : pdfReadDone
        ? "is-complete"
        : "is-ready";

  return (
    <div className="page-wrap financial-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Relatório Financeiro</h1>
          <p className="subtitle">Acompanhe em detalhes a saúde financeira do seu negócio.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="period-select">
            <CalendarDays size={16} />
            <AppSelect aria-label="Período do relatório" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
              {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </AppSelect>
          </div>
          {activeTab === "report" && <details className="view-options">
            <summary className="btn btn-ghost"><SlidersHorizontal size={15} /> Personalizar visão</summary>
            <div className="view-options-panel">
              <strong>Seções do relatório</strong>
              <fieldset>
                <legend>Exibir</legend>
                {FINANCE_SECTIONS.map((section) => (
                  <label key={section.id}>
                    <input type="checkbox" checked={visibleSections.has(section.id)} onChange={() => toggleFinanceSection(section.id)} />
                    {section.label}
                  </label>
                ))}
              </fieldset>
            </div>
          </details>}
          <button className="btn btn-primary" onClick={() => setFormOpen((open) => !open)}>
            {formOpen ? <X size={16} /> : <Plus size={16} />} {formOpen ? "Cancelar" : "Novo lançamento"}
          </button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="tabs" role="group" aria-label="Área financeira">
        <button className={`tab ${activeTab === "report" ? "active" : ""}`} onClick={() => setActiveTab("report")} aria-pressed={activeTab === "report"}>
          Visão geral
        </button>
        <button className={`tab ${activeTab === "pdf" ? "active" : ""}`} onClick={() => setActiveTab("pdf")} aria-haspopup="dialog" aria-expanded={activeTab === "pdf"}>
          <FileText size={15} /> Importar arquivo
        </button>
      </div>

      <dialog
        ref={importDialogRef}
        className="pdf-import-dialog"
        aria-labelledby="financial-import-title"
        onCancel={(event) => {
          event.preventDefault();
          setActiveTab("report");
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setActiveTab("report");
        }}
      >
        <section className="pdf-import-card" aria-busy={processingPdf || savingImport}>
          <div className="pdf-import-modal-head">
            <div className="pdf-import-heading">
              <span className="pdf-import-heading-icon" aria-hidden="true"><FileSpreadsheet size={20} /></span>
              <div>
                <p className="card-kicker">IMPORTAÇÃO DE DADOS</p>
                <h2 id="financial-import-title">Importe dados financeiros</h2>
                <p className="small muted">Revise os lançamentos antes de adicionar ao seu relatório.</p>
              </div>
            </div>
            <button className="modal-close pdf-import-close" type="button" aria-label="Fechar importação" onClick={() => setActiveTab("report")}>
              <X size={18} />
            </button>
          </div>
          <div className="pdf-import-formats" aria-label="Formatos aceitos">
            <span><FileText size={14} /> PDF</span>
            <span><FileSpreadsheet size={14} /> Excel / CSV</span>
            <span><FileText size={14} /> Word</span>
            <small>Até 10 MB por arquivo</small>
          </div>
          <label
            className={`pdf-dropzone ${isDraggingFile ? "is-dragging" : ""} ${processingPdf || savingImport ? "is-busy" : ""}`}
            htmlFor="financial-pdf"
            onDragEnter={(event) => {
              event.preventDefault();
              if (processingPdf || savingImport) return;
              setIsDraggingFile(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setIsDraggingFile(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDraggingFile(false);
              if (processingPdf || savingImport) return;
              chooseFinancialFile(event.dataTransfer.files[0]);
            }}
          >
            <span className="pdf-dropzone-icon"><Upload size={22} /></span>
            <strong>Arraste o arquivo até aqui</strong>
            <span>ou selecione um documento no seu dispositivo</span>
            <span className="pdf-dropzone-action"><Upload size={15} /> Selecionar arquivo</span>
            <input
              id="financial-pdf"
              type="file"
              aria-label="Selecionar arquivo financeiro"
              disabled={processingPdf || savingImport}
              accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,application/vnd.ms-excel,.xls,text/csv,.csv,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => {
                chooseFinancialFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {pdfFile && (
            <div className={`pdf-selected-file ${importFileStateClass}`} role="group" aria-label={`Arquivo selecionado: ${pdfFile.name}`}>
              <span className="pdf-selected-file-icon" aria-hidden="true">
                {importFileExtension === "xlsx" || importFileExtension === "xls" ? <FileSpreadsheet size={20} /> : <FileText size={20} />}
              </span>
              <div className="pdf-selected-file-copy">
                <strong title={pdfFile.name}>{pdfFile.name}</strong>
                <span>{importFileSize} <i aria-hidden="true">·</i> {importFileDetail}</span>
              </div>
              <div className="pdf-selected-file-controls">
                <span className="pdf-selected-file-state" role="status" aria-live="polite">{importFileState}</span>
                <button
                  className="pdf-selected-file-remove"
                  type="button"
                  aria-label={`Remover ${pdfFile.name}`}
                  disabled={processingPdf || savingImport}
                  onClick={clearImportPreview}
                >
                  <X size={17} />
                </button>
              </div>
              {(processingPdf || savingImport) && (
                <progress
                  className="pdf-selected-file-progress"
                  value={savingImport ? completedImportChunks : undefined}
                  max={Math.max(importBatchCount, 1)}
                  aria-label={savingImport ? "Progresso da importação" : "Leitura do arquivo"}
                />
              )}
            </div>
          )}
          <div className={`pdf-import-actions ${pdfTransactions.length > 0 && !pdfImportDone ? "has-confirm-action" : ""}`}>
            <button className="btn btn-ghost pdf-import-read-action" disabled={!pdfFile || processingPdf || savingImport || pdfImportDone} onClick={() => void processFinancialFile()}>
              {processingPdf ? "Lendo arquivo..." : pdfReadDone ? "Ler novamente" : "Ler arquivo"}
            </button>
            {pdfTransactions.length > 0 && !pdfImportDone && <button className="btn btn-primary pdf-import-confirm-action" disabled={savingImport || importNeedsCashDate || importHasInvalidRows} onClick={confirmImport}>
              {savingImport ? "Importando..." : `Confirmar ${pdfTransactions.length} lançamento(s)`}
            </button>}
          </div>
          <div className="import-flow" aria-label="Etapas da importação">
            <span className={pdfFile ? "done" : ""} data-step="1">Arquivo</span>
            <span className={pdfTransactions.length || pdfAnalysis ? "done" : ""} data-step="2">Prévia</span>
            <span className={pdfImportDone ? "done" : ""} data-step="3">Confirmar</span>
          </div>
          <div className="import-status" role="status" aria-live="polite">
            {processingPdf && "Lendo o arquivo e organizando os lançamentos..."}
            {savingImport && `Salvando lançamentos: ${importProgress}% concluído.`}
          </div>
          {importError && <p className="import-error" role="alert">{importError}</p>}
          {pdfImportDone && <div className="pdf-result"><strong>Importação concluída.</strong><p className="small muted">Os lançamentos já aparecem no relatório financeiro.</p></div>}
          {pdfTransactions.length > 0 && (
            <div className="pdf-result">
              <strong>{pdfImportDone ? "Lançamentos importados" : `${pdfTransactions.length} lançamento(s) encontrados · revise antes de importar`}</strong>
              <div className="pdf-transaction-list">
                {visibleImportTransactions.map((item, visibleIndex) => {
                  const index = importPreviewStart + visibleIndex;
                  const report = item.financialReport ?? "DRE";
                  const shownDate = report === "DFC" ? item.cashDate ?? item.date : item.competenceDate ?? item.date;
                  return (
                    <div className={`pdf-transaction-row pdf-transaction-review ${item.kind === "INCOME" ? "is-income" : "is-expense"}`} key={`${item.date}-${index}`}>
                      <div className="pdf-transaction-review-head">
                        <label className="import-review-field import-review-description">
                          <span>Descrição</span>
                          <input disabled={pdfImportDone} value={item.description} onChange={(event) => updateImportTransaction(index, { description: event.target.value })} />
                        </label>
                        <label className="import-review-field import-review-amount">
                          <span>Valor (R$)</span>
                          <input disabled={pdfImportDone} min="0.01" step="0.01" type="number" value={item.amount} onChange={(event) => updateImportTransaction(index, { amount: event.currentTarget.valueAsNumber || 0 })} />
                        </label>
                      </div>
                      <div className="pdf-transaction-review-fields">
                        <label className="import-review-field">
                          <span>{report === "DFC" ? "Data de caixa" : "Data de competência"}</span>
                          <input
                            disabled={pdfImportDone}
                            type="date"
                            value={shownDate}
                            onChange={(event) => updateImportTransaction(index, report === "DFC"
                              ? { date: event.target.value, cashDate: event.target.value }
                              : { date: event.target.value, competenceDate: event.target.value })}
                          />
                        </label>
                        <label className="import-review-field">
                          <span>Categoria</span>
                          <input
                            disabled={pdfImportDone}
                            list={`import-categories-${index}`}
                            value={item.category}
                            onChange={(event) => updateImportTransaction(index, { category: event.target.value })}
                          />
                          <datalist id={`import-categories-${index}`}>
                            {(data?.categories ?? []).map((categoryOption) => <option key={categoryOption} value={categoryOption} />)}
                            {["Receita", "IMPOSTO", "CMV", "RH", "ADMINISTRATIVA", "VENDAS", "FINANCEIRA", "NAO_OPERACIONAL", "OUTROS", "INVESTIMENTO", "FINANCIAMENTO"].map((categoryOption) => <option key={categoryOption} value={categoryOption} />)}
                          </datalist>
                        </label>
                        <label className="import-review-field">
                          <span>Tipo de lançamento</span>
                          <AppSelect disabled={pdfImportDone} value={item.kind} onChange={(event) => updateImportTransaction(index, { kind: event.target.value as Transaction["kind"] })}>
                            <option value="INCOME">Receita</option>
                            <option value="EXPENSE">Despesa</option>
                          </AppSelect>
                        </label>
                        {item.kind === "EXPENSE" && (
                          <label className="import-review-field">
                            <span>Comportamento do custo</span>
                            <AppSelect disabled={pdfImportDone} value={item.costBehavior ?? "AUTO"} onChange={(event) => updateImportTransaction(index, { costBehavior: event.target.value as NonNullable<Transaction["costBehavior"]> })}>
                              <option value="AUTO">Automático</option>
                              <option value="FIXED">Fixo</option>
                              <option value="VARIABLE">Variável</option>
                            </AppSelect>
                          </label>
                        )}
                        <label className="import-review-field">
                          <span>Relatório</span>
                          <AppSelect
                            disabled={pdfImportDone}
                            value={report}
                            onChange={(event) => {
                              const financialReport = event.target.value as NonNullable<Transaction["financialReport"]>;
                              updateImportTransaction(index, financialReport === "DFC"
                                ? { financialReport, date: item.cashDate ?? item.date, cashDate: item.cashDate ?? item.date }
                                : { financialReport });
                            }}
                          >
                            <option value="DRE">Somente DRE</option>
                            <option value="DFC">Somente caixa</option>
                            <option value="BOTH">DRE e caixa</option>
                          </AppSelect>
                        </label>
                        {report === "BOTH" && (
                          <label className="import-review-field">
                            <span>Data de liquidação</span>
                            <input disabled={pdfImportDone} required type="date" value={item.cashDate ?? ""} onChange={(event) => updateImportTransaction(index, { cashDate: event.target.value || undefined })} />
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {importPreviewPageCount > 1 && (
                <div className="import-preview-pagination">
                  <button className="btn btn-ghost" disabled={importPage === 0} onClick={() => setImportPage((page) => Math.max(0, page - 1))}>Anterior</button>
                  <span>{importPreviewStart + 1}–{Math.min(importPreviewStart + IMPORT_PREVIEW_PAGE_SIZE, pdfTransactions.length)} de {pdfTransactions.length}</span>
                  <button className="btn btn-ghost" disabled={importPage + 1 >= importPreviewPageCount} onClick={() => setImportPage((page) => Math.min(importPreviewPageCount - 1, page + 1))}>Próxima</button>
                </div>
              )}
              {importNeedsCashDate && !pdfImportDone && <p className="import-review-warning">Informe a data de liquidação em cada lançamento marcado para DRE e caixa antes de confirmar.</p>}
              {importHasInvalidRows && !pdfImportDone && <p className="import-review-warning">A descrição precisa estar preenchida e o valor deve ser maior que zero para todos os lançamentos.</p>}
              <p className="small muted">{pdfImportDone ? "Essas informações já aparecem no painel e nos gráficos." : "Revise descrição, categoria, competência e relatório de cada lançamento. Uma DRE sem data de liquidação não gera fluxo de caixa."}</p>
            </div>
          )}
          {pdfAnalysis && (
            <div className="pdf-result pdf-analysis">
              <strong>Análise contábil identificada</strong>
              <div className="pdf-analysis-grid">
                <span className="analysis-revenue">Receita bruta <b>{brl(pdfAnalysis.summary.grossRevenue)}</b></span><span className="analysis-tax">Impostos <b>{brl(pdfAnalysis.summary.taxes)}</b></span>
                <span className="analysis-net-revenue">Receita líquida <b>{brl(pdfAnalysis.summary.netRevenue)}</b></span><span className="analysis-cost">CMV e custos <b>{brl(pdfAnalysis.summary.cmv)}</b></span>
                <span className="analysis-profit">Lucro bruto <b>{brl(pdfAnalysis.summary.grossProfit)}</b></span><span className="analysis-expense">Despesas operacionais <b>{brl(pdfAnalysis.summary.operatingExpenses)}</b></span>
                <span className="analysis-net-profit">Lucro líquido <b>{brl(pdfAnalysis.summary.netProfit)}</b></span><span className={pdfAnalysis.summary.freeCashFlow === null ? "analysis-cash-unavailable" : pdfAnalysis.summary.freeCashFlow >= 0 ? "analysis-cash-positive" : "analysis-cash-negative"}>Fluxo de caixa livre <b>{pdfAnalysis.summary.freeCashFlow === null ? "Sem dados de liquidação" : brl(pdfAnalysis.summary.freeCashFlow)}</b></span>
              </div>
              <p className="small muted">DRE: competência · DFC: caixa · Margem bruta: {pdfAnalysis.summary.grossMargin === null ? "—" : percent(pdfAnalysis.summary.grossMargin / 100)} · Margem líquida: {pdfAnalysis.summary.netMargin === null ? "—" : percent(pdfAnalysis.summary.netMargin / 100)}</p>
              {pdfAnalysis.warnings.map((warning) => <p className="small muted" key={warning}>{warning}</p>)}
            </div>
          )}
          {pdfAnalysis && !pdfTransactions.length && <div className="pdf-result"><strong>Não encontramos lançamentos detalhados para importar.</strong><p className="small muted">A prévia encontrou valores, mas os resumos não viram lançamentos com data automaticamente, para evitar duplicar totais. PDFs digitalizados precisam passar por OCR antes do envio.</p></div>}
        </section>
      </dialog>

      <section className="kpi-grid finance-summary-grid" hidden={!visibleSections.has("summary")}>
        <FinanceCard
          icon={<BadgeDollarSign size={22} />}
          tone="blue"
          label="RECEITA BRUTA"
          value={brl(revenue)}
          delta={data ? signedPercent(data.comparison.revenue) : "—"}
          positive={(data?.comparison.revenue ?? 0) >= 0}
        />
        <FinanceCard
          icon={<Receipt size={22} />}
          tone="amber"
          label="CUSTOS TOTAIS"
          value={brl(costs)}
          delta={data ? signedPercent(data.comparison.costs) : "—"}
          positive={(data?.comparison.costs ?? 0) <= 0}
        />
        <FinanceCard
          icon={<TrendingUp size={22} />}
          tone="green"
          label="LUCRO LÍQUIDO"
          value={brl(financials?.netProfit ?? 0)}
          delta={data ? signedPercent(data.comparison.profit) : "—"}
          positive={(financials?.netProfit ?? 0) >= 0}
        />
        <FinanceCard
          icon={<Coins size={22} />}
          tone="purple"
          label="MARGEM LÍQUIDA"
          value={percent(margin)}
          delta={`${financials?.transactionCount ?? 0} lançamentos`}
          positive={margin >= 0}
        />
      </section>

      <section className="section split" hidden={!visibleSections.has("charts")}>
        <div className="card">
          <div className="card-head">
            <div>
              <p className="card-kicker">RESULTADO DO PERÍODO</p>
              <h2>Receita, custos e lucro</h2>
            </div>
          </div>
          {loading && !data ? (
            <p className="loading">Carregando...</p>
          ) : (
            <FinancialPerformanceChart points={data?.performanceSeries ?? []} height={250} />
          )}
        </div>

        <div className="card financial-expense-breakdown">
          <div className="card-head">
            <div>
              <p className="card-kicker">COMPOSIÇÃO DOS CUSTOS</p>
              <h2>Para onde vai o dinheiro</h2>
            </div>
          </div>
          {data?.expensesByCategory.length ? (
            <Donut
              slices={data.expensesByCategory.map((entry, index) => ({
                label: entry.category,
                value: entry.amount,
                color: expenseCategoryColor(entry.category, index),
              }))}
              centerValue={brl(costs)}
              centerLabel="Total"
              size={178}
              formatValue={brl}
            />
          ) : (
            <p className="empty" style={{ marginTop: 18 }}>
              Sem custos registrados no período.
            </p>
          )}
        </div>
      </section>

      <section className="section split dre-section" hidden={!visibleSections.has("dre")}>
        <div className="card dre-chart-card">
          <div className="dre-chart-card-head">
            <div>
              <h2>DRE do período</h2>
              <p>Selecione uma etapa para ver a composição e entender o resultado.</p>
            </div>
            <div className="dre-period-select">
              <AppSelect
                aria-label="Mês do DRE"
                className="dre-period-tag"
                value={dreMonth}
                onChange={(event) => setDreMonth(event.target.value)}
              >
                {dreMonthOptions.map((month) => (
                  <option key={month} value={month}>{formatDreMonth(month)}</option>
                ))}
              </AppSelect>
              <div className="dre-cash-balance">
                <span>Saldo restante</span>
                <strong className={dreCashPosition ? (dreCashPosition.closingBalance < 0 ? "is-negative" : "is-positive") : "is-unavailable"}>
                  {dreCashPosition ? brlExact(dreCashPosition.closingBalance) : "Não configurado"}
                </strong>
              </div>
            </div>
          </div>
          {loading && !data ? (
            <div className="dre-chart-loading" role="status">Carregando DRE...</div>
          ) : (
            <div className="dre-chart-scroll">
              <svg className="dre-chart-svg" viewBox="0 0 820 324" role="group" aria-label="Etapas do DRE. Selecione uma coluna para ver seus detalhes.">
                {chartTicks.map((fraction) => {
                  const y = chartZeroY - chartPositiveHeight * fraction;
                  return (
                    <g key={fraction}>
                      <line className={fraction === 0 ? "dre-gridline dre-gridline-zero" : "dre-gridline"} x1="82" x2="804" y1={y} y2={y} />
                      <text className="dre-axis-label" x="4" y={y - 5}>{compactBrl(chartMaxPositive * fraction)}</text>
                    </g>
                  );
                })}
                {chartMaxNegative > 0 && <text className="dre-axis-label" x="4" y={chartTop + chartPlotHeight + 17}>−{compactBrl(chartMaxNegative)}</text>}
                {chartStageGeometry.slice(0, -1).map((stage, index) => {
                  const nextStage = chartStageGeometry[index + 1];
                  if (!nextStage) return null;
                  return (
                    <path
                      key={`connector:${stage.id}`}
                      className="dre-waterfall-connector"
                      d={`M ${stage.center + 31} ${stage.barY} H ${nextStage.center - 31} V ${nextStage.barY}`}
                    />
                  );
                })}
                {chartStageGeometry.map((stage) => {
                  const share = dreRevenue ? percent((stage.value / dreRevenue) * 100) : "—";
                  const fillClass = stage.value < 0 ? "dre-bar-negative" : `dre-bar-${stage.id}`;
                  return (
                    <g
                      key={stage.id}
                      className={selectedDreStep === stage.id ? "dre-chart-step is-selected" : "dre-chart-step"}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedDreStep === stage.id}
                      aria-label={`Selecionar ${stage.label}: ${brlExact(stage.value)}; ${share} da receita bruta`}
                      onClick={() => setSelectedDreStep(stage.id)}
                      onKeyDown={(event) => selectDreStageWithKeyboard(event, stage.id, setSelectedDreStep)}
                    >
                      <rect className="dre-step-hit-area" x={stage.center - 60} y="14" width="120" height="298" rx="12" />
                      <rect className={`dre-chart-bar ${fillClass}`} x={stage.center - 30} y={stage.barY} width="60" height={stage.barHeight} rx="6" />
                      <text className={`dre-value-label${stage.id === "gross-revenue" ? " is-primary" : ""}${stage.value < 0 ? " is-negative" : ""}`} x={stage.center} y={stage.valueY} textAnchor="middle">{compactBrl(stage.value)}</text>
                      <text className="dre-step-label" x={stage.center} y="263" textAnchor="middle">
                        <tspan x={stage.center} dy="0">{stage.chartLines[0]}</tspan>
                        <tspan x={stage.center} dy="16">{stage.chartLines[1]}</tspan>
                        <tspan className="dre-step-share" x={stage.center} dy="19">{share}</tspan>
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
          <p className="dre-chart-footnote">Os valores consideram lançamentos confirmados classificados para DRE no mês selecionado.</p>
          <div className="dre-cash-summary" aria-label={`Resumo de caixa de ${formatDreMonth(dreMonth)}`}>
            <div>
              <span>Caixa inicial</span>
              <strong className={dreCashPosition ? (dreCashPosition.openingBalance < 0 ? "is-negative" : "is-positive") : "is-unavailable"}>
                {dreCashPosition ? brlExact(dreCashPosition.openingBalance) : "—"}
              </strong>
            </div>
            <div>
              <span>Caixa gerado</span>
              <strong className={dreCashFlow ? (dreCashFlow.freeCashFlow < 0 ? "is-negative" : "is-positive") : "is-unavailable"}>
                {dreCashFlow ? signedBrl(dreCashFlow.freeCashFlow) : "—"}
              </strong>
            </div>
            <div>
              <span>Saldo final</span>
              <strong className={dreCashPosition ? (dreCashPosition.closingBalance < 0 ? "is-negative" : "is-positive") : "is-unavailable"}>
                {dreCashPosition ? brlExact(dreCashPosition.closingBalance) : "—"}
              </strong>
            </div>
          </div>
          {!dreCashPosition && (
            <p className="dre-cash-note">Cadastre o saldo inicial e a data em Configurações para calcular o saldo restante deste mês.</p>
          )}
        </div>

        <aside className="card dre-detail-card" aria-live="polite" aria-atomic="true">
          <div className="dre-detail-head">
            <div>
              <h3>{selectedDreStage.detailTitle}</h3>
            </div>
            <span className="dre-detail-share-pill">{selectedDreShare === null ? "Sem receita" : percent(selectedDreShare)}</span>
          </div>
          <p className="dre-detail-description"><strong>{selectedDreStage.label}.</strong> {selectedDreStage.description}</p>
          <div className="dre-detail-total">
            <span>Resultado no mês</span>
            <strong className={selectedDreStage.value < 0 ? "is-negative" : selectedDreStep === "net-profit" ? "is-positive" : ""}>
              {brlExact(selectedDreStage.value)}
            </strong>
          </div>
          <div className="dre-formula">
            <span>Como calculamos</span>
            <p>{selectedDreStage.formula}</p>
          </div>
          <div className="dre-breakdown-heading">
            <h4>{selectedDreStage.detailHeading}</h4>
            <span>{selectedDreItems.length} {selectedDreItems.length === 1 ? "item" : "itens"}</span>
          </div>
          {selectedDreItems.length ? (
            <ul className="dre-breakdown-list">
              {selectedDreItems.map((item) => {
                const tone = item.value > 0 ? "positive" : item.value < 0 ? "negative" : "neutral";
                return (
                  <li className="dre-breakdown-row" key={item.id}>
                    <span className={`dre-breakdown-dot is-${tone}`} aria-hidden="true" />
                    <div className="dre-breakdown-copy">
                      <span>{item.label}</span>
                      <small>{item.note}</small>
                    </div>
                    <strong className={`dre-breakdown-value is-${tone}`}>{signedBrl(item.value)}</strong>
                    <span className="dre-breakdown-share">{dreRevenue ? percent((Math.abs(item.value) / dreRevenue) * 100) : "—"} da receita</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dre-breakdown-empty">Nenhum lançamento detalhado compõe esta etapa neste mês.</p>
          )}
          <p className="dre-insight">
            {dreRevenue
              ? `A cada R$ 100,00 faturados, ${signedBrl(selectedDreStage.value / dreRevenue * 100)} chegam a ${selectedDreStage.label.toLowerCase()}.`
              : "Registre receitas no mês para comparar cada etapa com o faturamento."}
          </p>
          <div className="dre-secondary-metrics">
            <div>
              <span>Margem líquida</span>
              <strong className={dreMargin >= 0 ? "is-positive" : "is-negative"}>{percent(dreMargin)}</strong>
            </div>
            <div>
              <span>Índice de custos</span>
              <strong className={dreCostIndex > 70 ? "is-negative" : ""}>{percent(dreCostIndex)}</strong>
            </div>
          </div>
        </aside>
      </section>

      <section className="section split" hidden={!visibleSections.has("cashflow")}>
        <div className="card">
          <div className="card-head">
            <div>
              <p className="card-kicker">DFC · REGIME DE CAIXA</p>
              <h2>Fluxo de caixa do período</h2>
            </div>
          </div>
          <div className="finance-summary-list">
            <div className="finance-summary-row"><span>Fluxo operacional</span><strong>{signedBrl(cashFlow?.operational ?? 0)}</strong></div>
            <div className="finance-summary-row"><span>Fluxo não operacional</span><strong>{signedBrl(cashFlow?.nonOperating ?? 0)}</strong></div>
            <div className="finance-summary-row"><span>Investimentos</span><strong>{signedBrl(cashFlow?.investments ?? 0)}</strong></div>
            <div className="finance-summary-row"><span>Financiamentos e aportes</span><strong>{signedBrl(cashFlow?.financing ?? 0)}</strong></div>
            <div className="finance-summary-row total"><span>Fluxo de caixa livre</span><strong>{signedBrl(cashFlow?.freeCashFlow ?? 0)}</strong></div>
            {data?.cashPosition && <>
              <div className="finance-summary-row"><span>Saldo no início do período</span><strong>{brlExact(data.cashPosition.openingBalance)}</strong></div>
              <div className="finance-summary-row target"><span>Saldo final calculado</span><strong>{brlExact(data.cashPosition.closingBalance)}</strong></div>
            </>}
          </div>
          <p className="small muted finance-note">O fluxo considera lançamentos confirmados marcados para a DFC e usa a data de caixa quando informada. {data?.cashPosition ? "O saldo final parte do saldo inicial cadastrado em Configurações." : "Cadastre o saldo inicial e a data em Configurações para calcular o saldo final."}</p>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <p className="card-kicker">MARGEM DE CONTRIBUIÇÃO</p>
              <h2>Ponto de equilíbrio e meta</h2>
            </div>
          </div>
          <div className="finance-summary-list">
            <div className="finance-summary-row"><span>Gastos variáveis</span><strong>{brlExact(financials?.variableExpenses ?? 0)}</strong></div>
            <div className="finance-summary-row"><span>Gastos fixos</span><strong>{brlExact(financials?.fixedExpenses ?? 0)}</strong></div>
            <div className="finance-summary-row"><span>Margem de contribuição</span><strong>{brlExact(financials?.contributionMargin ?? 0)}{financials?.contributionMarginRate !== null && financials?.contributionMarginRate !== undefined ? ` · ${percent(financials.contributionMarginRate * 100)}` : ""}</strong></div>
            <div className="finance-summary-row total"><span>Ponto de equilíbrio</span><strong>{financials?.breakEvenRevenue === null || financials?.breakEvenRevenue === undefined ? "—" : brlExact(financials.breakEvenRevenue)}</strong></div>
            <div className="finance-summary-row target"><span>Vendas para lucro de {percent((financials?.targetProfitMargin ?? 0.1) * 100)}</span><strong>{financials?.targetRevenue === null || financials?.targetRevenue === undefined ? "—" : brlExact(financials.targetRevenue)}</strong></div>
          </div>
          <p className="small muted finance-note">Impostos e custos diretos entram como variáveis pela categoria. Confira o tipo fixo/variável nos lançamentos para ajustar o cálculo.</p>
        </div>
      </section>

      <section className="section card" hidden={!visibleSections.has("transactions")}>
        <div className="section-head">
          <h2>Lançamentos</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <AppSelect className="btn btn-ghost" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="todos">Todos os tipos</option>
              <option value="INCOME">Receitas</option>
              <option value="EXPENSE">Despesas</option>
            </AppSelect>
            <AppSelect className="btn btn-ghost" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="todas">Todas as categorias</option>
              {(data?.categories ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </AppSelect>
          </div>
        </div>

        {formOpen && (
          <form className="inline-form finance-form" onSubmit={submit}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="description">Descrição</label>
                <input
                  id="description"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Cliente ABC"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="amount">Valor (R$)</label>
                <input
                  id="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="kind">Tipo</label>
                <AppSelect
                  id="kind"
                  value={form.kind}
                  onChange={(event) => setForm({ ...form, kind: event.target.value as Transaction["kind"] })}
                >
                  <option value="INCOME">Receita</option>
                  <option value="EXPENSE">Despesa</option>
                </AppSelect>
              </div>
              <div className="field">
                <label htmlFor="category">Categoria</label>
                <input
                  id="category"
                  list="categorias"
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  placeholder={form.kind === "INCOME" ? "Receita" : "Marketing"}
                />
                <datalist id="categorias">
                  {(data?.categories ?? []).map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="date">{form.financialReport === "DFC" ? "Data do caixa" : "Data de competência"}</label>
                <input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                />
              </div>
              <div className="field" hidden={form.financialReport !== "BOTH"}>
                  <label htmlFor="cashDate">Data de liquidação</label>
                <input
                  id="cashDate"
                  type="date"
                    required={form.financialReport === "BOTH"}
                  value={form.cashDate}
                  onChange={(event) => setForm({ ...form, cashDate: event.target.value })}
                />
                <p className="small muted">Só inclua no fluxo de caixa quando souber a data em que o valor foi liquidado.</p>
              </div>
              <div className="field">
                <label htmlFor="financialReport">Entra em</label>
                <AppSelect
                  id="financialReport"
                  value={form.financialReport}
                  onChange={(event) => setForm({ ...form, financialReport: event.target.value as NonNullable<Transaction["financialReport"]> })}
                >
                  <option value="BOTH">DRE e caixa (com liquidação)</option>
                  <option value="DRE">Somente DRE</option>
                  <option value="DFC">Somente fluxo de caixa</option>
                </AppSelect>
              </div>
              <div className="field" hidden={form.kind !== "EXPENSE"}>
                <label htmlFor="costBehavior">Tipo de gasto</label>
                <AppSelect
                  id="costBehavior"
                  value={form.costBehavior}
                  onChange={(event) => setForm({ ...form, costBehavior: event.target.value as NonNullable<Transaction["costBehavior"]> })}
                >
                  <option value="AUTO">Automático pela categoria</option>
                  <option value="FIXED">Gasto fixo</option>
                  <option value="VARIABLE">Gasto variável</option>
                </AppSelect>
              </div>
              <div className="field">
                <label htmlFor="status">Situação</label>
                <AppSelect
                  id="status"
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value as Transaction["status"] })}
                >
                  <option value="CONFIRMED">Confirmado</option>
                  <option value="PENDING">Pendente</option>
                </AppSelect>
              </div>
              <div className="field">
                <label htmlFor="recurrence">Repetição</label>
                <AppSelect
                  id="recurrence"
                  value={form.recurrence}
                  onChange={(event) =>
                    setForm({ ...form, recurrence: event.target.value as NonNullable<Transaction["recurrence"]> })
                  }
                >
                  <option value="NONE">Único</option>
                  <option value="MONTHLY">Todo mês</option>
                </AppSelect>
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar lançamento"}
              </button>
            </div>
          </form>
        )}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>DESCRIÇÃO</th>
                <th>CATEGORIA</th>
                <th>DATA</th>
                <th>SITUAÇÃO</th>
                <th className="num">VALOR</th>
                <th className="actions">AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {(data?.transactions ?? []).map((transaction) => (
                <tr key={transaction.id}>
                  <td>
                    <strong>{transaction.description}</strong>
                    <div className="small muted" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      {transaction.source ?? "manual"}
                      {transaction.auto && (
                        <span className="pill purple" title="Gerado por automação">
                          <Zap size={10} /> auto
                        </span>
                      )}
                      {transaction.recurrence === "MONTHLY" && !transaction.originId && (
                        <span className="pill blue" title="Repete todo mês">
                          <Repeat size={10} /> mensal
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    {transaction.category}
                    <div className="small muted" style={{ marginTop: 4 }}>
                      {transaction.financialReport === "DRE" ? "Somente DRE" : transaction.financialReport === "DFC" ? "Somente caixa" : "DRE e caixa"}
                      {transaction.kind === "EXPENSE" && ` · ${transaction.costBehavior === "FIXED" ? "Fixo" : transaction.costBehavior === "VARIABLE" ? "Variável" : "Tipo automático"}`}
                    </div>
                  </td>
                  <td>
                    {shortDate(transaction.financialReport === "DFC" ? transaction.cashDate ?? transaction.date : transaction.competenceDate ?? transaction.date)}
                    {transaction.financialReport !== "DFC" && transaction.cashDate && transaction.cashDate !== (transaction.competenceDate ?? transaction.date) && (
                      <div className="small muted" style={{ marginTop: 4 }}>Caixa: {shortDate(transaction.cashDate)}</div>
                    )}
                  </td>
                  <td>
                    <button
                      className={`pill ${transaction.status === "CONFIRMED" ? "green" : "amber"}`}
                      onClick={() => toggleStatus(transaction)}
                      title="Alternar situação"
                    >
                      {transaction.status === "CONFIRMED" ? <Check size={12} /> : null}
                      {transaction.status === "CONFIRMED" ? "Confirmado" : "Pendente"}
                    </button>
                  </td>
                  <td className="num" style={{ color: transaction.kind === "INCOME" ? "#4ade80" : "#ff8f7a" }}>
                    {transaction.kind === "INCOME" ? "+" : "−"} {brlExact(transaction.amount)}
                  </td>
                  <td className="actions">
                    <button className="icon-action danger" onClick={() => remove(transaction)} title="Excluir">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !data?.transactions.length && (
          <p className="empty" style={{ marginTop: 16 }}>
            Nenhum lançamento neste filtro. Cadastre o primeiro para ver os números reais.
          </p>
        )}
      </section>
    </div>
  );
}
function FinanceCard({
  icon,
  tone,
  label,
  value,
  delta,
  positive,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
  delta: string;
  positive: boolean;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-head">
        <div className={`kpi-icon ${tone}`}>{icon}</div>
        <div>
          <div className="card-kicker" style={{ margin: 0 }}>
            {label}
          </div>
          <div className="kpi-value" style={{ marginTop: 6 }}>
            {value}
          </div>
        </div>
      </div>
      <div className="kpi-meter">
        <span style={{ color: positive ? "#4ade80" : "#ff8f7a", fontWeight: 600 }}>{delta}</span>
        <span>vs. período anterior</span>
      </div>
    </div>
  );
}
