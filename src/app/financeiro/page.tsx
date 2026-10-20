"use client";

import { useEffect, useRef, useState } from "react";
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
  type FinancialTimelinePoint,
  type Financials,
  type MonthlyPoint,
  type Period,
} from "@/lib/finance";
import { brl, brlExact, percent, shortDate, signedPercent } from "@/lib/format";
import type { Transaction } from "@/lib/types";

type Payload = {
  period: Period;
  transactions: Transaction[];
  financials: Financials;
  cashFlow: CashFlowFinancials;
  cashPosition: CashPosition | null;
  comparison: { revenue: number; costs: number; profit: number };
  categories: string[];
  series: MonthlyPoint[];
  performanceSeries: FinancialTimelinePoint[];
  incomeByCategory: CategoryTotal[];
  expensesByCategory: CategoryTotal[];
  automated: number;
};

type PdfAnalysis = { summary: { grossRevenue: number; taxes: number; netRevenue: number; cmv: number; grossProfit: number; operatingExpenses: number; financialIncome: number; financialExpense: number; nonOperatingIncome: number; nonOperatingExpense: number; investments: number; financingIn: number; financingOut: number; netProfit: number; grossMargin: number | null; netMargin: number | null; operationalCashFlow: number; freeCashFlow: number; projectedFixedOutflow: number }; warnings: string[] };
type ImportTransaction = Pick<Transaction, "date" | "description" | "amount" | "kind" | "category" | "financialReport" | "competenceDate" | "cashDate" | "costBehavior">;
type ImportPreview = { transactions?: ImportTransaction[]; analysis?: PdfAnalysis };

const IMPORT_BATCH_SIZE = 500;
const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;
const IMPORT_EXTENSIONS = new Set(["pdf", "xlsx", "xls", "docx"]);

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
  financialReport: "BOTH" as NonNullable<Transaction["financialReport"]>,
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

export default function FinanceiroPage() {
  const [period, setPeriod] = useState<Period>("mes");
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
    `/api/transactions?period=${period}&kind=${kind}&category=${encodeURIComponent(category)}`,
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
      notify("Envie um PDF, uma planilha Excel (.xlsx/.xls) ou um documento Word (.docx).", "error");
      return;
    }
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      notify("O arquivo deve ter no máximo 10 MB.", "error");
      return;
    }
    setPdfFile(file);
    setPdfTransactions([]);
    setImportIds([]);
    setCompletedImportChunks(0);
    setPdfAnalysis(null);
    setPdfImportDone(false);
    setImportError("");
    void processFinancialFile(file);
  }

  async function confirmImport() {
    if (!pdfTransactions.length || pdfImportDone) return;
    setSavingImport(true);
    let saved = completedImportChunks * IMPORT_BATCH_SIZE;
    const extension = pdfFile?.name.toLowerCase().split(".").pop();
    const source = extension === "xlsx" || extension === "xls" ? "Excel" : extension === "docx" ? "Word" : "PDF";
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
  const cashFlow = data?.cashFlow;
  const revenue = financials?.grossRevenue ?? 0;
  const costs = financials?.costs ?? 0;
  const margin = (financials?.netMargin ?? 0) * 100;
  const costIndex = revenue ? (costs / revenue) * 100 : 0;
  const importBatchCount = Math.ceil(pdfTransactions.length / IMPORT_BATCH_SIZE);
  const importProgress = importBatchCount ? Math.round((completedImportChunks / importBatchCount) * 100) : 0;
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
            <span><FileSpreadsheet size={14} /> Excel</span>
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
              accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,application/vnd.ms-excel,.xls,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
            </div>
          )}
          <div className="pdf-import-actions">
            <button className="btn btn-primary" disabled={!pdfFile || processingPdf || savingImport || pdfImportDone} onClick={() => void processFinancialFile()}>
              {processingPdf ? "Lendo arquivo..." : pdfReadDone ? "Ler novamente" : "Ler arquivo"}
            </button>
            {pdfTransactions.length > 0 && !pdfImportDone && <button className="btn btn-primary" disabled={savingImport} onClick={confirmImport}>
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
          {savingImport && <progress className="import-progress" value={completedImportChunks} max={importBatchCount}> {importProgress}% </progress>}
          {pdfImportDone && <div className="pdf-result"><strong>Importação concluída.</strong><p className="small muted">Os lançamentos já aparecem no relatório financeiro.</p></div>}
          {pdfTransactions.length > 0 && (
            <div className="pdf-result">
              <strong>{pdfImportDone ? "Lançamentos importados" : `${pdfTransactions.length} lançamento(s) encontrados · revise antes de importar`}</strong>
              <div className="pdf-transaction-list">
                {pdfTransactions.slice(0, 8).map((item, index) => (
                  <div className={`pdf-transaction-row ${item.kind === "INCOME" ? "is-income" : "is-expense"}`} key={`${item.date}-${index}`}>
                    <span className="transaction-date">{item.date}</span>
                    <b>{item.description}</b>
                    <em>{item.kind === "INCOME" ? "+" : "−"} {brl(item.amount)}</em>
                  </div>
                ))}
              </div>
              {pdfTransactions.length > 8 && <p className="small muted">+ {pdfTransactions.length - 8} lançamento(s) adicionais</p>}
              <p className="small muted">{pdfImportDone ? "Essas informações já aparecem no painel e nos gráficos." : "Confira os lançamentos antes de confirmar a importação."}</p>
            </div>
          )}
          {pdfAnalysis && (
            <div className="pdf-result pdf-analysis">
              <strong>Análise contábil identificada</strong>
              <div className="pdf-analysis-grid">
                <span className="analysis-revenue">Receita bruta <b>{brl(pdfAnalysis.summary.grossRevenue)}</b></span><span className="analysis-tax">Impostos <b>{brl(pdfAnalysis.summary.taxes)}</b></span>
                <span className="analysis-net-revenue">Receita líquida <b>{brl(pdfAnalysis.summary.netRevenue)}</b></span><span className="analysis-cost">CMV e custos <b>{brl(pdfAnalysis.summary.cmv)}</b></span>
                <span className="analysis-profit">Lucro bruto <b>{brl(pdfAnalysis.summary.grossProfit)}</b></span><span className="analysis-expense">Despesas operacionais <b>{brl(pdfAnalysis.summary.operatingExpenses)}</b></span>
                <span className="analysis-net-profit">Lucro líquido <b>{brl(pdfAnalysis.summary.netProfit)}</b></span><span className={pdfAnalysis.summary.freeCashFlow >= 0 ? "analysis-cash-positive" : "analysis-cash-negative"}>Fluxo de caixa livre <b>{brl(pdfAnalysis.summary.freeCashFlow)}</b></span>
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

        <div className="card">
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

      <section className="section split" hidden={!visibleSections.has("dre")}>
        <div className="card">
          <div className="card-head">
            <div>
              <p className="card-kicker">DETALHAMENTO FINANCEIRO</p>
              <h2>DRE do período</h2>
            </div>
          </div>
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="table" style={{ minWidth: 420 }}>
              <thead>
                <tr>
                  <th>DESCRIÇÃO</th>
                  <th className="num">VALOR</th>
                  <th className="num">% DA RECEITA</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Receita bruta</td>
                  <td className="num">{brlExact(revenue)}</td>
                  <td className="num">100,0%</td>
                </tr>
                <tr>
                  <td style={{ paddingLeft: 26, color: "var(--muted)" }}>(−) Impostos sobre receita</td>
                  <td className="num" style={{ color: "#ff8f7a" }}>−{brlExact(financials?.taxes ?? 0)}</td>
                  <td className="num">{revenue ? percent(((financials?.taxes ?? 0) / revenue) * 100) : "—"}</td>
                </tr>
                <tr>
                  <td><strong>= Receita líquida</strong></td>
                  <td className="num"><strong>{brlExact(financials?.netRevenue ?? 0)}</strong></td>
                  <td className="num"><strong>{revenue ? percent(((financials?.netRevenue ?? 0) / revenue) * 100) : "—"}</strong></td>
                </tr>
                <tr>
                  <td style={{ paddingLeft: 26, color: "var(--muted)" }}>(−) CMV e custos variáveis</td>
                  <td className="num" style={{ color: "#ff8f7a" }}>−{brlExact(financials?.cmv ?? 0)}</td>
                  <td className="num">{revenue ? percent(((financials?.cmv ?? 0) / revenue) * 100) : "—"}</td>
                </tr>
                <tr>
                  <td><strong>= Lucro bruto</strong></td>
                  <td className="num"><strong>{brlExact(financials?.grossProfit ?? 0)}</strong></td>
                  <td className="num"><strong>{percent(((financials?.grossMargin ?? 0) * 100))}</strong></td>
                </tr>
                <tr>
                  <td><strong>(−) Despesas operacionais</strong></td>
                  <td className="num" style={{ color: "#ff8f7a" }}>−{brlExact(financials?.operationalExpenses ?? 0)}</td>
                  <td className="num">{revenue ? percent(((financials?.operationalExpenses ?? 0) / revenue) * 100) : "—"}</td>
                </tr>
                {(data?.expensesByCategory ?? []).filter((entry) => !/imposto|tribut|simples|cmv|custo|fornecedor|embalag|financeir|juros|nao operacional|extraordinari|investimento|divida|dividendo|aporte/i.test(entry.category)).map((entry) => (
                  <tr key={entry.category}>
                    <td style={{ paddingLeft: 26, color: "var(--muted)" }}>(−) {entry.category}</td>
                    <td className="num" style={{ color: "#ff8f7a" }}>
                      −{brlExact(entry.amount)}
                    </td>
                    <td className="num">{revenue ? percent((entry.amount / revenue) * 100) : "—"}</td>
                  </tr>
                ))}
                <tr>
                  <td>Resultado financeiro</td>
                  <td className="num" style={{ color: (financials?.financialResult ?? 0) < 0 ? "#ff8f7a" : "#4ade80" }}>{signedBrl(financials?.financialResult ?? 0)}</td>
                  <td className="num">{revenue ? percent(((financials?.financialResult ?? 0) / revenue) * 100) : "—"}</td>
                </tr>
                <tr>
                  <td>Resultado não operacional</td>
                  <td className="num" style={{ color: (financials?.nonOperatingResult ?? 0) < 0 ? "#ff8f7a" : "#4ade80" }}>{signedBrl(financials?.nonOperatingResult ?? 0)}</td>
                  <td className="num">{revenue ? percent(((financials?.nonOperatingResult ?? 0) / revenue) * 100) : "—"}</td>
                </tr>
                <tr>
                  <td>
                    <strong>= Lucro líquido</strong>
                  </td>
                  <td className="num">
                    <strong style={{ color: (financials?.netProfit ?? 0) >= 0 ? "#4ade80" : "#ff8f7a" }}>
                      {brlExact(financials?.netProfit ?? 0)}
                    </strong>
                  </td>
                  <td className="num">
                    <strong>{percent(margin)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <p className="card-kicker">INDICADORES DE DESEMPENHO</p>
              <h2>Margem e eficiência</h2>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 24 }}>
            <Indicator
              value={margin}
              label="Margem líquida"
              hint="lucro sobre a receita"
              color={margin >= 0 ? "#22c55e" : "#ef4444"}
            />
            <Indicator
              value={costIndex}
              label="Índice de custos"
              hint="custos sobre a receita"
              color={costIndex > 70 ? "#ef4444" : "#3b82f6"}
            />
          </div>
          <p className="small muted" style={{ marginTop: 22 }}>
            {data?.automated ?? 0} lançamento(s) do período vieram de automações — custo da equipe, pagamentos
            concluídos e recorrências.
          </p>
        </div>
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
                <label htmlFor="cashDate">Data no caixa</label>
                <input
                  id="cashDate"
                  type="date"
                  value={form.cashDate}
                  onChange={(event) => setForm({ ...form, cashDate: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="financialReport">Entra em</label>
                <AppSelect
                  id="financialReport"
                  value={form.financialReport}
                  onChange={(event) => setForm({ ...form, financialReport: event.target.value as NonNullable<Transaction["financialReport"]> })}
                >
                  <option value="BOTH">DRE e fluxo de caixa</option>
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

function Indicator({ value, label, hint, color }: { value: number; label: string; hint: string; color: string }) {
  const intensity = Math.min(Math.abs(value), 100);
  const state = value < 0 ? "Atenção" : value > 70 && label.includes("custos") ? "Atenção" : "Saudável";
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 13.5 }}>{label}</strong>
        <strong style={{ color, fontSize: 16 }}>{percent(value)}</strong>
      </div>
      <div style={{ height: 7, borderRadius: 999, overflow: "hidden", background: "#16264a" }} aria-label={`${label}: ${percent(value)}`}>
        <span style={{ display: "block", width: `${intensity}%`, height: "100%", borderRadius: "inherit", background: color }} />
      </div>
      <div className="small muted" style={{ marginTop: 1 }}>
        {state} · {hint}
      </div>
    </div>
  );
}
