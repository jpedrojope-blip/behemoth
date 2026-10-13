"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeDollarSign,
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { BarChart } from "@/components/ui/bar-chart";
import { LineChart } from "@/components/ui/line-chart";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useResource } from "@/lib/client";
import {
  PERIOD_LABELS,
  type Financials,
  type MonthlyPoint,
  type Period,
  type WeekdayPoint,
} from "@/lib/finance";
import { brl, longDate, percent, shortDate, signedPercent } from "@/lib/format";
import type { CalendarEvent, Company, Insight, Transaction } from "@/lib/types";

type Overview = {
  company: Company;
  period: Period;
  financials: Financials;
  comparison: { revenue: number; costs: number; profit: number; previous: Financials };
  series: MonthlyPoint[];
  weekday: WeekdayPoint[];
  insights: Insight[];
  agenda: CalendarEvent[];
  team: { total: number; humans: number; agents: number; monthlyCost: number };
  openActionItems: number;
  recentTransactions: Transaction[];
};

const AGENDA_COLORS: Record<CalendarEvent["kind"], string> = {
  MEETING: "blue",
  TASK: "purple",
  PAYMENT: "orange",
  EVENT: "blue",
};

type DashboardWidgetId =
  | "revenue" | "costs" | "team" | "profit" | "summary" | "trend" | "weekly"
  | "transactions" | "insights" | "agenda" | "shortcuts";

const DASHBOARD_WIDGETS: Array<{ id: DashboardWidgetId; label: string; group: "Indicadores" | "Seções" }> = [
  { id: "revenue", label: "Receita", group: "Indicadores" },
  { id: "costs", label: "Custos", group: "Indicadores" },
  { id: "team", label: "Equipe", group: "Indicadores" },
  { id: "profit", label: "Lucro líquido", group: "Indicadores" },
  { id: "summary", label: "Resumo executivo", group: "Seções" },
  { id: "trend", label: "Evolução financeira", group: "Seções" },
  { id: "weekly", label: "Resumo semanal", group: "Seções" },
  { id: "transactions", label: "Últimos lançamentos", group: "Seções" },
  { id: "insights", label: "Pontos de atenção", group: "Seções" },
  { id: "agenda", label: "Agenda", group: "Seções" },
  { id: "shortcuts", label: "Ações rápidas", group: "Seções" },
];

const DEFAULT_DASHBOARD_WIDGETS = DASHBOARD_WIDGETS.map(({ id }) => id);

function readDashboardWidgets(): Set<DashboardWidgetId> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem("behemoth-dashboard-widgets") ?? "null");
    if (!Array.isArray(stored)) return new Set(DEFAULT_DASHBOARD_WIDGETS);
    return new Set(stored.filter((value): value is DashboardWidgetId =>
      DASHBOARD_WIDGETS.some((widget) => widget.id === value),
    ));
  } catch {
    return new Set(DEFAULT_DASHBOARD_WIDGETS);
  }
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>("mes");
  const [visibleWidgets, setVisibleWidgets] = useState<Set<DashboardWidgetId>>(() => new Set(DEFAULT_DASHBOARD_WIDGETS));
  const [insightIndex, setInsightIndex] = useState(0);
  const [kpiDetail, setKpiDetail] = useState<{ title: string; body: string } | null>(null);
  const { data, loading, error } = useResource<Overview>(`/api/overview?period=${period}`);
  const notify = useToast();

  useEffect(() => {
    setVisibleWidgets(readDashboardWidgets());
  }, []);

  const today = useMemo(() => longDate(new Date()), []);
  const insights = data?.insights ?? [];
  const insight = insights[insightIndex % Math.max(insights.length, 1)];
  const isEmpty = Boolean(data) && !data?.financials.transactionCount && !data?.team.total;

  const financials = data?.financials;
  const revenue = financials?.grossRevenue ?? 0;
  const costs = financials?.costs ?? 0;
  const previousRevenue = data?.comparison.previous.grossRevenue ?? 0;

  function toggleWidget(id: DashboardWidgetId) {
    const next = new Set(visibleWidgets);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setVisibleWidgets(next);
    try {
      window.localStorage.setItem("behemoth-dashboard-widgets", JSON.stringify([...next]));
    } catch {
      // A visão segue utilizável se o navegador bloquear o armazenamento local.
    }
  }

  async function toggleEvent(event: CalendarEvent) {
    try {
      await apiFetch(`/api/events/${event.id}`, { method: "PATCH", body: JSON.stringify({ done: !event.done }) });
      notify(event.done ? "Compromisso reaberto." : "Compromisso concluído.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao atualizar.", "error");
    }
  }

  return (
    <div className="page-wrap">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">{today.toUpperCase()}</p>
          <h1>
            {greeting()}, {data?.company.ownerName.split(" ")[0] ?? "..."}. <span>Clareza para decidir.</span>
          </h1>
          <p className="subtitle">Financeiro, pessoas, agenda e sinais do negócio em uma única visão.</p>
        </div>
        <div className="dashboard-head-actions">
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
          <details className="view-options">
            <summary className="btn btn-ghost"><SlidersHorizontal size={15} /> Personalizar visão</summary>
            <div className="view-options-panel">
              <strong>O que você quer acompanhar?</strong>
              {(["Indicadores", "Seções"] as const).map((group) => (
                <fieldset key={group}>
                  <legend>{group}</legend>
                  {DASHBOARD_WIDGETS.filter((widget) => widget.group === group).map((widget) => (
                    <label key={widget.id}>
                      <input type="checkbox" checked={visibleWidgets.has(widget.id)} onChange={() => toggleWidget(widget.id)} />
                      {widget.label}
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          </details>
          <Link className="btn btn-primary" href="/financeiro?novo=1">
            <Plus size={16} /> Novo Lançamento
          </Link>
        </div>
      </section>

      {error && <p className="form-error">{error}</p>}

      {isEmpty && (
        <section className="onboarding">
          <div>
            <p className="card-kicker">CONSTRUA SUA VISÃO</p>
            <h2>Comece a montar a central de comando da sua empresa</h2>
            <p className="subtitle">
              A Behemoth só transforma dados reais em decisões úteis. Conecte os primeiros sinais do negócio para
              enxergar o que está acontecendo.
            </p>
          </div>
          <div className="onboarding-steps">
            <Link href="/configuracoes">
              <b>1</b>
              <span>Nome da empresa, nicho e plano</span>
              <ArrowUpRight size={15} />
            </Link>
            <Link href="/financeiro?novo=1">
              <b>2</b>
              <span>Primeiro lançamento de receita ou custo</span>
              <ArrowUpRight size={15} />
            </Link>
            <Link href="/equipe?novo=1">
              <b>3</b>
              <span>Pessoas e agentes de IA do time</span>
              <ArrowUpRight size={15} />
            </Link>
            <Link href="/calendario">
              <b>4</b>
              <span>Compromissos da semana</span>
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </section>
      )}

      <section className="kpi-grid dashboard-kpi-grid" aria-label="Indicadores do negócio" hidden={!(["revenue", "costs", "team", "profit"] as DashboardWidgetId[]).some((id) => visibleWidgets.has(id))}>
        {visibleWidgets.has("revenue") && <Kpi
          icon={<BadgeDollarSign size={24} />}
          tone="blue"
          label="Receita"
          sub="Total de entradas"
          value={brl(revenue)}
          meter={previousRevenue ? Math.min(100, (revenue / Math.max(revenue, previousRevenue)) * 100) : revenue ? 100 : 0}
          meterLabel={data ? `${signedPercent(data.comparison.revenue)} vs. anterior` : "—"}
          positive={(data?.comparison.revenue ?? 0) >= 0}
          chartValues={(data?.series ?? []).map((point) => point.income)}
          chartLabels={(data?.series ?? []).map((point) => point.label)}
        />}
        {visibleWidgets.has("costs") && <Kpi
          icon={<Wallet size={22} />}
          tone="amber"
          label="Custos"
          sub="Total de despesas"
          value={brl(costs)}
          meter={revenue ? (costs / revenue) * 100 : 0}
          meterLabel={revenue ? `${percent((costs / revenue) * 100, 0)} da receita` : "sem receita no período"}
          barTone="amber"
          chartValues={(data?.series ?? []).map((point) => point.expense)}
          chartLabels={(data?.series ?? []).map((point) => point.label)}
        />}
        {visibleWidgets.has("team") && <Kpi
          icon={<Users size={22} />}
          tone="purple"
          label="Equipe"
          sub={`${data?.team.humans ?? 0} pessoas · ${data?.team.agents ?? 0} agentes IA`}
          value={String(data?.team.total ?? 0)}
          meter={data?.team.total ? ((data.team.agents ?? 0) / data.team.total) * 100 : 0}
          meterLabel={`${brl(data?.team.monthlyCost ?? 0)} por mês`}
          barTone="purple"
          chartValues={[data?.team.humans ?? 0, data?.team.agents ?? 0]}
          chartLabels={["Pessoas", "IA"]}
        />}
        {visibleWidgets.has("profit") && <Kpi
          icon={<TrendingUp size={22} />}
          tone="green"
          label="Lucro Líquido"
          sub="Receita menos custos"
          value={brl(financials?.netProfit ?? 0)}
          meter={(financials?.netMargin ?? 0) * 100}
          meterLabel={`${percent((financials?.netMargin ?? 0) * 100)} de margem`}
          barTone={(financials?.netProfit ?? 0) < 0 ? "danger" : "green"}
          chartValues={(data?.series ?? []).map((point) => point.profit)}
          chartLabels={(data?.series ?? []).map((point) => point.label)}
        />}
      </section>

      {visibleWidgets.has("summary") && <section className="dashboard-focus" aria-label="Resumo executivo">
        <div>
          <p className="card-kicker">RESUMO DO PERÍODO</p>
          <strong>O que precisa da sua atenção?</strong>
          <span>Indicadores financeiros, equipe e compromissos em uma única visão.</span>
        </div>
        <div className="dashboard-focus-metrics">
          <div><small>Ações abertas</small><strong>{data ? data.openActionItems : "—"}</strong></div>
          <div><small>Membros da equipe</small><strong>{data ? data.team.total : "—"}</strong></div>
          <div><small>Margem líquida</small><strong>{data ? percent((financials?.netMargin ?? 0) * 100, 0) : "—"}</strong></div>
        </div>
        <Link className="link-btn" href="/reunioes">Ver próximas ações <ArrowUpRight size={14} /></Link>
      </section>}

      {kpiDetail && <div className="modal-backdrop" onClick={() => setKpiDetail(null)}><section className="detail-modal detail-modal-chart" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setKpiDetail(null)} aria-label="Fechar"><span>×</span></button><p className="card-kicker">VISÃO DETALHADA</p><h2>{kpiDetail.title}</h2><p>{kpiDetail.body}</p><div className="modal-chart"><BarChart labels={kpiDetail.title === "Equipe" ? ["Pessoas", "Agentes IA"] : (data?.series ?? []).map((point) => point.label)} series={kpiDetail.title === "Receita" ? [{ label: "Receita", values: (data?.series ?? []).map((point) => point.income), color: "#3b82f6" }] : kpiDetail.title === "Custos" ? [{ label: "Custos", values: (data?.series ?? []).map((point) => point.expense), color: "#ef4444" }] : kpiDetail.title === "Equipe" ? [{ label: "Equipe", values: [data?.team.humans ?? 0, data?.team.agents ?? 0], color: "#8b5cf6" }] : [{ label: "Lucro líquido", values: (data?.series ?? []).map((point) => point.profit), color: (financials?.netProfit ?? 0) >= 0 ? "#22c55e" : "#ef4444" }]} height={210} highlightLast /></div><button className="btn btn-primary" onClick={() => setKpiDetail(null)}>Entendi</button></section></div>}

      <section className="content-grid" hidden={!visibleWidgets.has("trend") && !visibleWidgets.has("weekly")}>
        <div className="card" hidden={!visibleWidgets.has("trend")}>
          <div className="card-head">
            <div>
              <h2>Desempenho Financeiro</h2>
              <p className="subtitle" style={{ fontSize: 12.5, marginTop: 6 }}>
                Total de ganhos no período
              </p>
              <div className="big-number">
                {brl(revenue)}
                <span className="trend" style={{ color: (data?.comparison.revenue ?? 0) >= 0 ? undefined : "#ff8f7a" }}>
                  {(data?.comparison.revenue ?? 0) >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {data ? signedPercent(data.comparison.revenue) : "—"}
                </span>
              </div>
            </div>
            <Link className="select-small" href="/financeiro">
              Mensal <ChevronDown size={14} />
            </Link>
          </div>
          {loading && !data ? (
            <p className="loading">Carregando dados...</p>
          ) : (
            <LineChart
              labels={(data?.series ?? []).map((point) => point.label)}
              series={[
                { label: "Receita", values: (data?.series ?? []).map((point) => point.income), color: "#2563eb", fill: true },
                { label: "Custos", values: (data?.series ?? []).map((point) => -point.expense), color: "#ef4444" },
                { label: "Resultado", values: (data?.series ?? []).map((point) => point.profit), color: (financials?.netProfit ?? 0) >= 0 ? "#22c55e" : "#f97316" },
              ]}
              height={240}
            />
          )}
        </div>

        <div className="card" hidden={!visibleWidgets.has("weekly")}>
          <div className="card-head">
            <div>
              <h2>Relatório Semanal</h2>
              <p className="subtitle" style={{ fontSize: 12.5, marginTop: 6 }}>
                Distribuição por dia da semana
              </p>
            </div>
          </div>
          {loading && !data ? (
            <p className="loading">Carregando...</p>
          ) : (
            <BarChart
              labels={(data?.weekday ?? []).map((point) => point.label)}
              series={[
                { label: "Receita", values: (data?.weekday ?? []).map((point) => point.income), color: "#2563eb" },
                { label: "Despesas", values: (data?.weekday ?? []).map((point) => point.expense), color: "#64748b" },
              ]}
              height={240}
            />
          )}
        </div>
      </section>

      <section className="bottom-grid" hidden={!visibleWidgets.has("transactions") && !visibleWidgets.has("insights")}>
        <div className="card" hidden={!visibleWidgets.has("transactions")}>
          <div className="card-head">
            <h2>Últimos Lançamentos</h2>
            <Link className="link-btn" href="/financeiro">
              Ver todos <ChevronRight size={15} />
            </Link>
          </div>
          <div style={{ marginTop: 8 }}>
            {(data?.recentTransactions ?? []).map((transaction) => (
              <div className="list-item" key={transaction.id}>
                <div
                  className="quick-icon"
                  style={
                    transaction.kind === "INCOME"
                      ? { background: "#10331f", color: "#4ade80" }
                      : { background: "#37260d", color: "#f7b955" }
                  }
                >
                  {transaction.kind === "INCOME" ? <TrendingUp size={17} /> : <TrendingDown size={17} />}
                </div>
                <div className="grow">
                  <strong>{transaction.description}</strong>
                  <span>
                    {transaction.category} · {shortDate(transaction.date)}
                  </span>
                </div>
                <b
                  style={{
                    fontSize: 13.5,
                    fontVariantNumeric: "tabular-nums",
                    color: transaction.kind === "INCOME" ? "#4ade80" : "#ff8f7a",
                  }}
                >
                  {transaction.kind === "INCOME" ? "+" : "−"} {brl(transaction.amount)}
                </b>
              </div>
            ))}
            {!data?.recentTransactions.length && !loading && (
              <p className="empty">
                Nenhum lançamento ainda. <Link href="/financeiro?novo=1">Cadastrar o primeiro</Link>
              </p>
            )}
          </div>
        </div>

        <div className="card insight-card" hidden={!visibleWidgets.has("insights")}>
          <div className="card-head">
            <div>
              <p className="card-kicker">PRÓXIMA DECISÃO</p>
              <h2>O que merece atenção</h2>
            </div>
            <div className="sparkle">
              <Sparkles size={18} />
            </div>
          </div>
          <div className="insight-body">
            <div className="insight-icon">
              <Zap size={18} />
            </div>
            <div>
              <strong>{insight?.title ?? "Sem dados no período"}</strong>
              <p>{insight?.text ?? "Cadastre lançamentos para gerar recomendações."}</p>
              <Link href="/financeiro">
                Abrir análise <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
          <div className="insight-footer">
            <span>● Baseado em {financials?.transactionCount ?? 0} lançamentos</span>
            <button onClick={() => setInsightIndex((index) => index + 1)} disabled={insights.length < 2}>
              {insights.length ? `${(insightIndex % insights.length) + 1} de ${insights.length}` : "0"}
            </button>
          </div>
        </div>
      </section>

      <section className="bottom-grid" hidden={!visibleWidgets.has("agenda") && !visibleWidgets.has("shortcuts")}>
        <div className="card" hidden={!visibleWidgets.has("agenda")}>
          <div className="card-head">
            <div>
              <p className="card-kicker">AGENDA DE HOJE</p>
              <h2>Seus próximos compromissos</h2>
            </div>
            <Link className="link-btn" href="/calendario">
              Ver calendário <ChevronRight size={15} />
            </Link>
          </div>
          {!data?.agenda.length && !loading && (
            <p className="empty" style={{ marginTop: 18 }}>
              Nenhum compromisso para hoje. <Link href="/calendario">Agendar</Link>
            </p>
          )}
          {data?.agenda.map((event) => (
            <div className="agenda-item" key={event.id}>
              <div className="agenda-time">{event.time}</div>
              <div className={`agenda-line ${AGENDA_COLORS[event.kind]}`} />
              <div className="agenda-info">
                <strong style={event.done ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>
                  {event.title}
                </strong>
                <span>
                  {event.owner} · {event.durationMinutes} min
                </span>
              </div>
              <button className="icon-action" onClick={() => toggleEvent(event)} title={event.done ? "Reabrir" : "Concluir"}>
                <ArrowUpRight size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="card" hidden={!visibleWidgets.has("shortcuts")}>
          <div className="card-head">
            <div>
              <p className="card-kicker">ATALHOS</p>
              <h2>Ações Rápidas</h2>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <Action href="/financeiro" icon={<FileText size={18} />} title="Gerar Relatório" hint="Resultado do período por categoria" />
            <Action href="/financeiro?novo=1" icon={<Plus size={18} />} title="Novo Lançamento" hint="Registre receita ou despesa" />
            <Action href="/equipe?novo=1" icon={<Bot size={18} />} title="Convidar Agente" hint="Adicione um agente de IA ao time" />
            <Action href="/reunioes?novo=1" icon={<CalendarDays size={18} />} title="Nova Reunião" hint="Notas, resumo e itens de ação" />
          </div>
        </div>
      </section>
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function Kpi({
  icon,
  tone,
  label,
  sub,
  value,
  meter,
  meterLabel,
  barTone,
  positive = true,
  chartValues,
  chartLabels,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  sub: string;
  value: string;
  meter: number;
  meterLabel: string;
  barTone?: string;
  positive?: boolean;
  chartValues: number[];
  chartLabels: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const chartColor = tone === "green" && !positive ? "#ef4444" : tone === "amber" ? "#f5a524" : tone === "purple" ? "#8b5cf6" : tone === "green" ? "#22c55e" : "#3b82f6";
  return (
    <button type="button" className="kpi-card kpi-card-button" aria-expanded={expanded} aria-label={`${label}. Clique para abrir ou fechar o gráfico.`} onClick={() => setExpanded((value) => !value)}>
      <div className="kpi-head">
        <div className={`kpi-icon ${tone}`}>{icon}</div>
        <div>
          <div className="kpi-label">{label}</div>
          <div className="kpi-sub">{sub}</div>
          <div className="kpi-value">{value}</div>
        </div>
      </div>
      <div className="kpi-meter">
        <div className={`bar ${barTone ?? ""}`}>
          <span style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
        </div>
        <span style={positive ? undefined : { color: "#ff8f7a" }}>{meterLabel}</span>
      </div>
      {expanded && <div className="kpi-expanded-chart"><BarChart labels={chartLabels} series={[{ label, values: chartValues.map(Math.abs), color: chartColor }]} height={155} highlightLast /></div>}
      <div className="kpi-link">
        Ver detalhes <ChevronRight size={14} />
      </div>
    </button>
  );
}

function Action({ href, icon, title, hint }: { href: string; icon: React.ReactNode; title: string; hint: string }) {
  return (
    <Link className="action-row" href={href}>
      <div className="icon">{icon}</div>
      <div style={{ flex: 1 }}>
        <strong>{title}</strong>
        <span>{hint}</span>
      </div>
      <ChevronRight size={16} color="#6b7d9c" />
    </Link>
  );
}
