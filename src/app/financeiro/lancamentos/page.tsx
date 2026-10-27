"use client";

import Link from "next/link";
import { useState } from "react";
import { AppSelect } from "@/components/ui/app-select";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useAutoRevalidate, useResource } from "@/lib/client";
import { PERIOD_LABELS, type Period } from "@/lib/finance";
import { brlExact, shortDate } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { ArrowLeft, Check, FileText, Plus, Receipt, Repeat, Search, Trash2, Zap } from "lucide-react";

type TransactionListPayload = {
  transactions: Transaction[];
  categories: string[];
};

type PeriodFilter = "todos" | Period;

export default function FinancialTransactionsPage() {
  const [period, setPeriod] = useState<PeriodFilter>("todos");
  const [kind, setKind] = useState("todos");
  const [category, setCategory] = useState("todas");
  const [search, setSearch] = useState("");
  const notify = useToast();
  const requestPeriod: Period = period === "todos" ? "mes" : period;
  const url = `/api/transactions?period=${requestPeriod}&all=${period === "todos"}&kind=${kind}&category=${encodeURIComponent(category)}`;
  const { data, error, loading } = useResource<TransactionListPayload>(url);
  useAutoRevalidate();

  const query = search.trim().toLocaleLowerCase("pt-BR");
  const transactions = (data?.transactions ?? []).filter((transaction) => {
    if (!query) return true;
    const searchableValues = [transaction.description, transaction.counterparty, transaction.category, transaction.source]
      .filter((value): value is string => Boolean(value));
    return searchableValues.some((value) => value.toLocaleLowerCase("pt-BR").includes(query));
  });

  async function toggleStatus(transaction: Transaction) {
    try {
      await apiFetch(`/api/transactions/${encodeURIComponent(transaction.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: transaction.status === "CONFIRMED" ? "PENDING" : "CONFIRMED" }),
      });
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao atualizar o lançamento.", "error");
    }
  }

  async function remove(transaction: Transaction) {
    if (!window.confirm(`Excluir "${transaction.description}"?`)) return;
    try {
      await apiFetch(`/api/transactions/${encodeURIComponent(transaction.id)}`, { method: "DELETE" });
      notify("Lançamento excluído.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao excluir o lançamento.", "error");
    }
  }

  return (
    <div className="page-wrap financial-page financial-transactions-page">
      <div className="page-head financial-transactions-head">
        <div>
          <Link className="finance-back-link" href="/financeiro">
            <ArrowLeft size={15} aria-hidden="true" /> Relatório Financeiro
          </Link>
          <h1 className="page-title financial-transactions-title">Lançamentos</h1>
          <p className="subtitle">Entradas e saídas registradas na plataforma, em todos os períodos.</p>
        </div>
        <Link className="btn btn-primary" href="/financeiro?novo=1">
          <Plus size={16} aria-hidden="true" /> Novo lançamento
        </Link>
      </div>

      <div className="tabs financial-transactions-tabs" role="group" aria-label="Área financeira">
        <Link className="tab" href="/financeiro">Visão geral</Link>
        <Link className="tab active" href="/financeiro/lancamentos" aria-current="page">
          <Receipt size={15} aria-hidden="true" /> Lançamentos
        </Link>
        <Link className="tab" href="/financeiro?importar=1">
          <FileText size={15} aria-hidden="true" /> Importar arquivo
        </Link>
      </div>

      {error && <p className="form-error">{error}</p>}

      <section className="section card financial-transactions-card">
        <div className="financial-transactions-toolbar">
          <div>
            <p className="card-kicker">MOVIMENTAÇÕES FINANCEIRAS</p>
            <h2>Todos os lançamentos</h2>
            <p className="small muted">
              {loading ? "Carregando lançamentos..." : `${transactions.length} lançamento(s) encontrados`}
            </p>
          </div>
          <div className="financial-transactions-filters">
            <AppSelect aria-label="Período dos lançamentos" value={period} onChange={(event) => setPeriod(event.target.value as PeriodFilter)}>
              <option value="todos">Todos os períodos</option>
              {Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </AppSelect>
            <AppSelect aria-label="Tipo de lançamento" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="todos">Entradas e saídas</option>
              <option value="INCOME">Entradas</option>
              <option value="EXPENSE">Saídas</option>
            </AppSelect>
            <AppSelect aria-label="Categoria do lançamento" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="todas">Todas as categorias</option>
              {(data?.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
            </AppSelect>
            <label className="search-field financial-transactions-search">
              <Search size={16} aria-hidden="true" />
              <input aria-label="Buscar lançamento" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar lançamento" />
            </label>
          </div>
        </div>

        <div className="table-wrap financial-transactions-table-wrap">
          <table className="table financial-transactions-table">
            <thead>
              <tr>
                <th>LANÇAMENTO / FAVORECIDO</th>
                <th>CATEGORIA</th>
                <th>DATA</th>
                <th>RELATÓRIO</th>
                <th>SITUAÇÃO</th>
                <th className="num">VALOR</th>
                <th className="actions">AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => {
                const isGeneratedTeamCost = transaction.auto && (
                  transaction.id.startsWith("auto_salary_") || transaction.id.startsWith("auto_agent_cost_")
                );
                const date = transaction.financialReport === "DFC"
                  ? transaction.cashDate ?? transaction.date
                  : transaction.competenceDate ?? transaction.date;
                const report = transaction.financialReport === "DRE"
                  ? "Somente DRE"
                  : transaction.financialReport === "DFC" ? "Somente caixa" : "DRE e caixa";

                return (
                  <tr key={transaction.id}>
                    <td>
                      <strong>{transaction.description}</strong>
                      <div className="small muted financial-transaction-counterparty">
                        {transaction.counterparty ? `Para: ${transaction.counterparty}` : "Favorecido não informado"}
                      </div>
                      <div className="small muted financial-transaction-source">
                        {transaction.source ?? "manual"}
                        {transaction.auto && <span className="pill purple" title="Gerado por automação"><Zap size={10} aria-hidden="true" /> auto</span>}
                        {transaction.recurrence === "MONTHLY" && !transaction.originId && <span className="pill blue" title="Repete todo mês"><Repeat size={10} aria-hidden="true" /> mensal</span>}
                      </div>
                    </td>
                    <td>
                      {transaction.category}
                      {transaction.kind === "EXPENSE" && (
                        <div className="small muted financial-transaction-cost-kind">
                          {transaction.costBehavior === "FIXED" ? "Fixo" : transaction.costBehavior === "VARIABLE" ? "Variável" : "Tipo automático"}
                        </div>
                      )}
                    </td>
                    <td>{shortDate(date)}</td>
                    <td>{report}</td>
                    <td>
                      {isGeneratedTeamCost ? (
                        <span className={`pill ${transaction.status === "CONFIRMED" ? "green" : "amber"}`} title="Atualize este valor no perfil do integrante.">
                          {transaction.status === "CONFIRMED" && <Check size={12} aria-hidden="true" />}
                          {transaction.status === "CONFIRMED" ? "Confirmado" : "Pendente"}
                        </span>
                      ) : (
                        <button
                          className={`pill ${transaction.status === "CONFIRMED" ? "green" : "amber"}`}
                          onClick={() => toggleStatus(transaction)}
                          title="Alternar situação"
                        >
                          {transaction.status === "CONFIRMED" && <Check size={12} aria-hidden="true" />}
                          {transaction.status === "CONFIRMED" ? "Confirmado" : "Pendente"}
                        </button>
                      )}
                    </td>
                    <td className={`num ${transaction.kind === "INCOME" ? "financial-transaction-income" : "financial-transaction-expense"}`}>
                      {transaction.kind === "INCOME" ? "+" : "−"} {brlExact(transaction.amount)}
                    </td>
                    <td className="actions">
                      <button className="icon-action danger" onClick={() => remove(transaction)} title="Excluir lançamento" aria-label={`Excluir ${transaction.description}`}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && transactions.length === 0 && (
          <p className="empty financial-transactions-empty">
            {search || kind !== "todos" || category !== "todas"
              ? "Nenhum lançamento corresponde aos filtros selecionados."
              : "Nenhum lançamento encontrado. Cadastre ou importe o primeiro para começar."}
          </p>
        )}
      </section>
    </div>
  );
}
