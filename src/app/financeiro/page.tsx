"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Check, ChevronDown, Plus, Repeat, Trash2, X, Zap } from "lucide-react";
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

const EMPTY_FORM = {
  description: "",
  amount: "",
  kind: "INCOME" as Transaction["kind"],
  category: "",
  date: new Date().toISOString().slice(0, 10),
  status: "CONFIRMED" as Transaction["status"],
  recurrence: "NONE" as NonNullable<Transaction["recurrence"]>,
};

export default function FinanceiroPage() {
  const [period, setPeriod] = useState<Period>("mes");
  const [kind, setKind] = useState("todos");
  const [category, setCategory] = useState("todas");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
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

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <p className="eyebrow">RELATÓRIO FINANCEIRO</p>
          <h1 className="page-title">Resultado do período</h1>
          <p className="subtitle">Receita, custos, lucro e margem calculados sobre os lançamentos registrados.</p>
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

      <section className="section stat-grid">
        <div className="stat">
          <span>Receita bruta</span>
          <strong>{brl(financials?.grossRevenue ?? 0)}</strong>
          <small>{data ? `${signedPercent(data.comparison.revenue)} vs. período anterior` : "—"}</small>
        </div>
        <div className="stat">
          <span>Custos totais</span>
          <strong>{brl(financials?.costs ?? 0)}</strong>
          <small>{data ? `${signedPercent(data.comparison.costs)} vs. período anterior` : "—"}</small>
        </div>
        <div className="stat">
          <span>Lucro líquido</span>
          <strong>{brl(financials?.netProfit ?? 0)}</strong>
          <small>{data ? `${signedPercent(data.comparison.profit)} vs. período anterior` : "—"}</small>
        </div>
        <div className="stat">
          <span>Margem líquida</span>
          <strong>{percent((financials?.netMargin ?? 0) * 100)}</strong>
          <small>
            {financials?.transactionCount ?? 0} lançamentos · {data?.automated ?? 0} automáticos
          </small>
        </div>
      </section>

      <section className="section split">
        <div className="card">
          <div className="card-head">
            <div>
              <p className="card-kicker">EVOLUÇÃO MENSAL</p>
              <h2>Receita, custos e lucro</h2>
            </div>
          </div>
          {loading && !data ? (
            <p className="loading">Carregando...</p>
          ) : (
            <LineChart
              labels={(data?.series ?? []).map((point) => point.label)}
              series={[
                { label: "Receita", values: (data?.series ?? []).map((point) => point.income), color: "#316cf4", fill: true },
                { label: "Custos", values: (data?.series ?? []).map((point) => point.expense), color: "#f4a860" },
                { label: "Lucro", values: (data?.series ?? []).map((point) => point.profit), color: "#2eab84" },
              ]}
            />
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <p className="card-kicker">DRE SIMPLIFICADA</p>
              <h2>Composição dos custos</h2>
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            {(data?.expensesByCategory ?? []).map((entry) => (
              <div className="list-item" key={entry.category}>
                <div className="grow">
                  <strong>{entry.category}</strong>
                  <div className="bar amber">
                    <span style={{ width: `${Math.round(entry.share * 100)}%` }} />
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong style={{ fontSize: 13 }}>{brl(entry.amount)}</strong>
                  <div className="small muted">{percent(entry.share * 100, 0)}</div>
                </div>
              </div>
            ))}
            {!data?.expensesByCategory.length && <p className="empty">Sem custos no período.</p>}
          </div>
        </div>
      </section>

      <section className="section card">
        <div className="section-head">
          <h2>Lançamentos</h2>
          <div style={{ display: "flex", gap: 10 }}>
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
          <form className="inline-form" onSubmit={submit}>
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
                    <div className="small muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
                  <td className="num" style={{ color: transaction.kind === "INCOME" ? "#1d9271" : "#c9563a" }}>
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
