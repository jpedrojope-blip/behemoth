"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeDollarSign,
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { BarChart } from "@/components/ui/bar-chart";
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

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>("mes");
  const [insightIndex, setInsightIndex] = useState(0);
  const { data, loading, error } = useResource<Overview>(`/api/overview?period=${period}`);
  const notify = useToast();

  const today = useMemo(() => longDate(new Date()), []);
  const insights = data?.insights ?? [];
  const insight = insights[insightIndex % Math.max(insights.length, 1)];
  const isEmpty = Boolean(data) && !data?.financials.transactionCount && !data?.team.total;

  const financials = data?.financials;
  const revenue = financials?.grossRevenue ?? 0;
  const costs = financials?.costs ?? 0;
  const previousRevenue = data?.comparison.previous.grossRevenue ?? 0;

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
            {greeting()}, {data?.company.ownerName.split(" ")[0] ?? "..."} <span>✦</span>
          </h1>
          <p className="subtitle">Aqui está o que está acontecendo na sua empresa.</p>
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
          <Link className="btn btn-primary" href="/financeiro?novo=1">
            <Plus size={16} /> Novo Lançamento
          </Link>
        </div>
      </section>

      {error && <p className="form-error">{error}</p>}

      {isEmpty && (
        <section className="onboarding">
          <div>
            <p className="card-kicker">PRIMEIROS PASSOS</p>
            <h2>Seu workspace está zerado — cadastre os dados reais</h2>
            <p className="subtitle">
              Nenhum número aqui é estimado: cada indicador aparece assim que você registrar as informações da sua
              empresa.
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

      <section className="kpi-grid">
        <Kpi
          icon={<BadgeDollarSign size={24} />}
          tone="blue"
          label="Receita"
          sub="Total de entradas"
          value={brl(revenue)}
          meter={previousRevenue ? Math.min(100, (revenue / Math.max(revenue, previousRevenue)) * 100) : revenue ? 100 : 0}
          meterLabel={data ? `${signedPercent(data.comparison.revenue)} vs. anterior` : "—"}
          positive={(data?.comparison.revenue ?? 0) >= 0}
          href="/financeiro"
        />
        <Kpi
          icon={<Wallet size={22} />}
          tone="amber"
          label="Custos"
          sub="Total de despesas"
          value={brl(costs)}
          meter={revenue ? (costs / revenue) * 100 : 0}
          meterLabel={revenue ? `${percent((costs / revenue) * 100, 0)} da receita` : "sem receita no período"}
          barTone="amber"
          href="/financeiro"
        />
        <Kpi
          icon={<Users size={22} />}
          tone="purple"
          label="Clientes ativos"
          sub={`${data?.team.humans ?? 0} humanos · ${data?.team.agents ?? 0} agentes IA`}
          value={String(data?.team.total ?? 0)}
          meter={data?.team.total ? ((data.team.agents ?? 0) / data.team.total) * 100 : 0}
          meterLabel={`${brl(data?.team.monthlyCost ?? 0)} por mês`}
          barTone="purple"
          href="/equipe"
        />
        <Kpi
          icon={<TrendingUp size={22} />}
          tone="green"
          label="Lucro Líquido"
          sub="Receita menos custos"
          value={brl(financials?.netProfit ?? 0)}
          meter={(financials?.netMargin ?? 0) * 100}
          meterLabel={`${percent((financials?.netMargin ?? 0) * 100)} de margem`}
          barTone="green"
          href="/financeiro"
        />
      </section>

      <section className="content-grid">
        <div className="card">
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
            <BarChart
              labels={(data?.series ?? []).map((point) => point.label)}
              series={[{ label: "Receita", values: (data?.series ?? []).map((point) => point.income), color: "#2563eb" }]}
              highlightLast
              height={240}
            />
          )}
        </div>

        <div className="card">
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

      <section className="bottom-grid">
        <div className="card">
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

        <div className="card insight-card">
          <div className="card-head">
            <div>
              <p className="card-kicker">BEHEMOTH INTELLIGENCE</p>
              <h2>Insights para você</h2>
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
                Ver análise completa <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
          <div className="insight-footer">
            <span>● Calculado sobre {financials?.transactionCount ?? 0} lançamentos</span>
            <button onClick={() => setInsightIndex((index) => index + 1)} disabled={insights.length < 2}>
              {insights.length ? `${(insightIndex % insights.length) + 1} de ${insights.length}` : "0"}
            </button>
          </div>
        </div>
      </section>

      <section className="bottom-grid">
        <div className="card">
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

        <div className="card">
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
  href,
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
  href: string;
}) {
  return (
    <Link className="kpi-card" href={href}>
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
      <div className="kpi-link">
        Ver detalhes <ChevronRight size={14} />
      </div>
    </Link>
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
