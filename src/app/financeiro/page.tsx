"use client";

import { useEffect, useState } from "react";
import {
  BadgeDollarSign,
  CalendarDays,
  Check,
  ChevronDown,
  Coins,
  FileText,
  Upload,
  Plus,
  Receipt,
  Repeat,
  TrendingUp,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Donut } from "@/components/ui/donut";
import { LineChart } from "@/components/ui/line-chart";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useResource } from "@/lib/client";
import {
  PERIOD_LABELS,
  type CategoryTotal,
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
  comparison: { revenue: number; costs: number; profit: number };
  categories: string[];
  series: MonthlyPoint[];
  incomeByCategory: CategoryTotal[];
  expensesByCategory: CategoryTotal[];
  automated: number;
};

type PdfAnalysis = { summary: { grossRevenue: number; taxes: number; netRevenue: number; cmv: number; grossProfit: number; operatingExpenses: number; netProfit: number; grossMargin: number | null; netMargin: number | null; operationalCashFlow: number; freeCashFlow: number; projectedFixedOutflow: number }; warnings: string[] };

function summaryTransactions(analysis: PdfAnalysis) {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const values: Array<[string, number, Transaction["kind"], string]> = [
    ["Receita bruta importada", analysis.summary.grossRevenue, "INCOME", "Receita"],
    ["Impostos sobre receita importados", analysis.summary.taxes, "EXPENSE", "IMPOSTO"],
    ["CMV e custos importados", analysis.summary.cmv, "EXPENSE", "CMV"],
    ["Despesas operacionais importadas", analysis.summary.operatingExpenses, "EXPENSE", "Despesas operacionais"],
  ];
  return values.filter(([, value]) => value > 0).map(([description, amount, kind, category]) => ({ date, description, amount, kind, category }));
}

const EMPTY_FORM = {
  description: "",
  amount: "",
  kind: "INCOME" as Transaction["kind"],
  category: "",
  date: new Date().toISOString().slice(0, 10),
  status: "CONFIRMED" as Transaction["status"],
  recurrence: "NONE" as NonNullable<Transaction["recurrence"]>,
};

function expenseHealthColor(amount: number, revenue: number) {
  const ratio = revenue ? amount / revenue : 0;
  if (ratio > 0.4) return "#ef4444";
  if (ratio > 0.2) return "#f5a524";
  return "#22c55e";
}

export default function FinanceiroPage() {
  const [period, setPeriod] = useState<Period>("mes");
  const [kind, setKind] = useState("todos");
  const [category, setCategory] = useState("todas");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"report" | "pdf">("report");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [processingPdf, setProcessingPdf] = useState(false);
  const [pdfTransactions, setPdfTransactions] = useState<Array<Pick<Transaction, "date" | "description" | "amount" | "kind" | "category">>>([]);
  const [pdfAnalysis, setPdfAnalysis] = useState<PdfAnalysis | null>(null);
  const notify = useToast();

  const { data, loading, error } = useResource<Payload>(
    `/api/transactions?period=${period}&kind=${kind}&category=${encodeURIComponent(category)}`,
  );

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("novo")) setFormOpen(true);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/api/transactions", { method: "POST", body: JSON.stringify(form) });
      notify("Lançamento salvo.", "success");
      setForm({ ...EMPTY_FORM, kind: form.kind });
      setFormOpen(false);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao salvar.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function processPdf() {
    if (!pdfFile) return;
    setProcessingPdf(true);
    try {
      const body = new FormData();
      body.append("file", pdfFile);
      const response = await fetch("/api/finance/pdf", { method: "POST", body });
      const payload = (await response.json()) as { error?: string; text?: string; transactions?: typeof pdfTransactions; analysis?: PdfAnalysis };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível processar o PDF.");
      const extracted = payload.transactions ?? [];
      const imported = extracted.length ? extracted : payload.analysis ? summaryTransactions(payload.analysis) : [];
      for (const item of imported) {
        await apiFetch("/api/transactions", {
          method: "POST",
          body: JSON.stringify({ ...item, status: "CONFIRMED", source: "PDF" }),
        });
      }
      setPdfTransactions(imported);
      setPdfAnalysis(payload.analysis ?? null);
      notify(imported.length ? `${imported.length} informação(ões) do arquivo foram adicionadas ao painel.` : "Arquivo lido, mas não havia valores para importar.", imported.length ? "success" : "error");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao processar PDF.", "error");
    } finally {
      setProcessingPdf(false);
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
  const revenue = financials?.grossRevenue ?? 0;
  const costs = financials?.costs ?? 0;
  const margin = (financials?.netMargin ?? 0) * 100;
  const costIndex = revenue ? (costs / revenue) * 100 : 0;

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <h1 className="page-title">Relatório Financeiro</h1>
          <p className="subtitle">Acompanhe em detalhes a saúde financeira do seu negócio.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="period-select">
            <CalendarDays size={16} />
            <select value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
              {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown size={15} />
          </div>
          <button className="btn btn-primary" onClick={() => setFormOpen((open) => !open)}>
            {formOpen ? <X size={16} /> : <Plus size={16} />} {formOpen ? "Cancelar" : "Novo lançamento"}
          </button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="tabs" role="tablist" aria-label="Área financeira">
        <button className={`tab ${activeTab === "report" ? "active" : ""}`} onClick={() => setActiveTab("report")} role="tab" aria-selected={activeTab === "report"}>
          Visão geral
        </button>
        <button className={`tab ${activeTab === "pdf" ? "active" : ""}`} onClick={() => setActiveTab("pdf")} role="tab" aria-selected={activeTab === "pdf"}>
          <FileText size={15} /> Importar PDF
        </button>
      </div>

      {activeTab === "pdf" && (
        <section className="section card pdf-import-card">
          <div className="card-head">
            <div>
              <p className="card-kicker">IMPORTAÇÃO DE DADOS</p>
              <h2>Adicione um relatório em PDF</h2>
              <p className="small muted">Envie um extrato ou relatório financeiro para usar as informações no seu painel.</p>
            </div>
          </div>
          <label className="pdf-dropzone" htmlFor="financial-pdf">
            <Upload size={25} />
            <strong>{pdfFile ? pdfFile.name : "Selecione ou arraste seu PDF aqui"}</strong>
            <span>{pdfFile ? `${(pdfFile.size / 1024 / 1024).toFixed(2)} MB · pronto para importar` : "PDF ou Excel · máximo recomendado de 10 MB"}</span>
            <input id="financial-pdf" type="file" accept="application/pdf,.pdf,.xlsx,.xls" onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)} />
          </label>
          <div className="pdf-import-actions">
            <button className="btn btn-primary" disabled={!pdfFile || processingPdf} onClick={processPdf}>
              {processingPdf ? "Lendo PDF..." : "Adicionar informações"}
            </button>
            {pdfFile && <button className="btn btn-ghost" onClick={() => setPdfFile(null)}>Remover arquivo</button>}
          </div>
          {pdfTransactions.length > 0 && (
            <div className="pdf-result">
              <strong>{pdfTransactions.length} lançamento(s) identificado(s)</strong>
              <div className="pdf-transaction-list">
                {pdfTransactions.slice(0, 8).map((item, index) => (
                  <div key={`${item.date}-${index}`}><span>{item.date}</span><b>{item.description}</b><em>{item.kind === "INCOME" ? "+" : "−"} {brl(item.amount)}</em></div>
                ))}
              </div>
              {pdfTransactions.length > 8 && <p className="small muted">+ {pdfTransactions.length - 8} lançamento(s) adicionais</p>}
              <p className="small muted">Essas informações já foram adicionadas ao painel e aos gráficos deste período.</p>
            </div>
          )}
          {pdfAnalysis && (
            <div className="pdf-result pdf-analysis">
              <strong>Análise contábil identificada</strong>
              <div className="pdf-analysis-grid">
                <span>Receita bruta <b>{brl(pdfAnalysis.summary.grossRevenue)}</b></span><span>Impostos <b>{brl(pdfAnalysis.summary.taxes)}</b></span>
                <span>Receita líquida <b>{brl(pdfAnalysis.summary.netRevenue)}</b></span><span>CMV e custos <b>{brl(pdfAnalysis.summary.cmv)}</b></span>
                <span>Lucro bruto <b>{brl(pdfAnalysis.summary.grossProfit)}</b></span><span>Despesas operacionais <b>{brl(pdfAnalysis.summary.operatingExpenses)}</b></span>
                <span>Lucro líquido <b>{brl(pdfAnalysis.summary.netProfit)}</b></span><span>Fluxo de caixa livre <b>{brl(pdfAnalysis.summary.freeCashFlow)}</b></span>
              </div>
              <p className="small muted">DRE: competência · DFC: caixa · Margem bruta: {pdfAnalysis.summary.grossMargin === null ? "—" : percent(pdfAnalysis.summary.grossMargin / 100)} · Margem líquida: {pdfAnalysis.summary.netMargin === null ? "—" : percent(pdfAnalysis.summary.netMargin / 100)}</p>
              {pdfAnalysis.warnings.map((warning) => <p className="small muted" key={warning}>{warning}</p>)}
            </div>
          )}
          {pdfAnalysis && !pdfTransactions.length && <div className="pdf-result"><strong>Não encontramos valores financeiros importáveis neste arquivo.</strong><p className="small muted">Tente enviar um PDF com valores ou uma planilha com os números preenchidos.</p></div>}
        </section>
      )}

      {activeTab === "report" && <>
      <section className="kpi-grid">
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
      </>}

      {activeTab === "report" && <>
      <section className="section split">
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
            <LineChart
              labels={(data?.series ?? []).map((point) => point.label)}
              series={[
                { label: "Receita", values: (data?.series ?? []).map((point) => point.income), color: "#3b82f6", fill: true },
                { label: "Custos", values: (data?.series ?? []).map((point) => -point.expense), color: "#ef4444" },
                { label: "Resultado", values: (data?.series ?? []).map((point) => point.profit), color: (financials?.netProfit ?? 0) >= 0 ? "#22c55e" : "#f97316" },
              ]}
              height={250}
            />
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
              slices={data.expensesByCategory.map((entry) => ({
                label: entry.category,
                value: entry.amount,
                color: expenseHealthColor(entry.amount, revenue),
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
      </>}

      <section className="section split">
        <div className="card">
          <div className="card-head">
            <div>
              <p className="card-kicker">DETALHAMENTO FINANCEIRO</p>
              <h2>Demonstrativo do período</h2>
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
                {(data?.expensesByCategory ?? []).filter((entry) => !/imposto|tribut|simples|cmv|custo|fornecedor|embalag/i.test(entry.category)).map((entry) => (
                  <tr key={entry.category}>
                    <td style={{ paddingLeft: 26, color: "var(--muted)" }}>(−) {entry.category}</td>
                    <td className="num" style={{ color: "#ff8f7a" }}>
                      −{brlExact(entry.amount)}
                    </td>
                    <td className="num">{revenue ? percent((entry.amount / revenue) * 100) : "—"}</td>
                  </tr>
                ))}
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

      <section className="section card">
        <div className="section-head">
          <h2>Lançamentos</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select className="btn btn-ghost" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="todos">Todos os tipos</option>
              <option value="INCOME">Receitas</option>
              <option value="EXPENSE">Despesas</option>
            </select>
            <select className="btn btn-ghost" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="todas">Todas as categorias</option>
              {(data?.categories ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
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
                <select
                  id="kind"
                  value={form.kind}
                  onChange={(event) => setForm({ ...form, kind: event.target.value as Transaction["kind"] })}
                >
                  <option value="INCOME">Receita</option>
                  <option value="EXPENSE">Despesa</option>
                </select>
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
                <label htmlFor="date">Data</label>
                <input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="status">Situação</label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value as Transaction["status"] })}
                >
                  <option value="CONFIRMED">Confirmado</option>
                  <option value="PENDING">Pendente</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="recurrence">Repetição</label>
                <select
                  id="recurrence"
                  value={form.recurrence}
                  onChange={(event) =>
                    setForm({ ...form, recurrence: event.target.value as NonNullable<Transaction["recurrence"]> })
                  }
                >
                  <option value="NONE">Único</option>
                  <option value="MONTHLY">Todo mês</option>
                </select>
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
                  <td>{transaction.category}</td>
                  <td>{shortDate(transaction.date)}</td>
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
