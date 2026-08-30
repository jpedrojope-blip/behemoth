"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  FileText,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
  Zap,
} from "lucide-react";
import { LineChart } from "@/components/ui/line-chart";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useResource } from "@/lib/client";
import { PERIOD_LABELS, type Financials, type MonthlyPoint, type Period } from "@/lib/finance";
import { brl, longDate, signedPercent } from "@/lib/format";
import type { CalendarEvent, Company, Insight, Transaction } from "@/lib/types";

type Overview = {
  company: Company;
  period: Period;
  financials: Financials;
  comparison: { revenue: number; costs: number; profit: number; previous: Financials };
  series: MonthlyPoint[];
  insights: Insight[];
  agenda: CalendarEvent[];
  upcoming: CalendarEvent[];
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
  const isEmpty = Boolean(data) && !data?.financials.transactionCount && !data?.team.total;
  const insight = insights[insightIndex % Math.max(insights.length, 1)];

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
          label="Receita"
          value={brl(data?.financials.grossRevenue ?? 0)}
          change={data ? signedPercent(data.comparison.revenue) : "—"}
          positive={(data?.comparison.revenue ?? 0) >= 0}
          detail={`vs. período anterior`}
          tone="blue"
          href="/financeiro"
        />
        <Kpi
          label="Custos"
          value={brl(data?.financials.costs ?? 0)}
          change={data ? signedPercent(data.comparison.costs) : "—"}
          positive={(data?.comparison.costs ?? 0) <= 0}
          detail={`${data?.financials.transactionCount ?? 0} lançamentos`}
          tone="cream"
          href="/financeiro"
        />
        <Kpi
          label="Equipe & agentes"
          value={String(data?.team.total ?? 0)}
          suffix={`${data?.team.agents ?? 0} agentes IA`}
          change={brl(data?.team.monthlyCost ?? 0)}
          positive
          detail="custo mensal"
          tone="lavender"
          href="/equipe"
        />
        <Kpi
          label="Lucro líquido"
          value={brl(data?.financials.netProfit ?? 0)}
          change={data ? signedPercent(data.comparison.profit) : "—"}
          positive={(data?.financials.netProfit ?? 0) >= 0}
          detail={`margem ${((data?.financials.netMargin ?? 0) * 100).toFixed(1).replace(".", ",")}%`}
          tone="mint"
          href="/financeiro"
        />
      </section>

      <section className="content-grid">
        <div className="card performance-card">
          <div className="card-head">
            <div>
              <p className="card-kicker">DESEMPENHO FINANCEIRO</p>
              <h2>Receita x custos por mês</h2>
              <div className="big-number">
                {brl(data?.financials.netProfit ?? 0)}
                <span className="trend">
                  {(data?.comparison.profit ?? 0) >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}{" "}
                  {data ? signedPercent(data.comparison.profit) : "—"}
                </span>
              </div>
            </div>
            <Link className="select-small" href="/financeiro">
              Detalhar <ArrowUpRight size={14} />
            </Link>
          </div>
          {loading && !data ? (
            <p className="loading">Carregando dados...</p>
          ) : (
            <LineChart
              labels={(data?.series ?? []).map((point) => point.label)}
              series={[
                { label: "Receita", values: (data?.series ?? []).map((point) => point.income), color: "#316cf4", fill: true },
                { label: "Custos", values: (data?.series ?? []).map((point) => point.expense), color: "#f4a860" },
              ]}
            />
          )}
        </div>

        <div className="card insight-card">
          <div className="card-head">
            <div>
              <p className="card-kicker">BEHEMOTH INTELLIGENCE</p>
              <h2>Insights para você</h2>
            </div>
            <div className="sparkle">
              <Sparkles size={17} />
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
            <span>● Calculado sobre {data?.financials.transactionCount ?? 0} lançamentos</span>
            <button onClick={() => setInsightIndex((index) => index + 1)} disabled={insights.length < 2}>
              {insights.length ? `${(insightIndex % insights.length) + 1} de ${insights.length}` : "0"}
            </button>
          </div>
        </div>
      </section>

      <section className="bottom-grid">
        <div className="card agenda-card">
          <div className="card-head">
            <div>
              <p className="card-kicker">AGENDA DE HOJE</p>
              <h2>Seus próximos compromissos</h2>
            </div>
            <Link className="link-btn" href="/calendario">
              Ver calendário <ArrowUpRight size={15} />
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
              <button onClick={() => toggleEvent(event)} title={event.done ? "Reabrir" : "Concluir"}>
                <ArrowUpRight size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="card quick-card">
          <div className="card-head">
            <div>
              <p className="card-kicker">ATALHOS</p>
              <h2>Ações rápidas</h2>
            </div>
          </div>
          <div className="quick-grid">
            <Quick icon={<FileText size={19} />} text="Relatório financeiro" href="/financeiro" />
            <Quick icon={<Plus size={20} />} text="Novo lançamento" href="/financeiro?novo=1" />
            <Quick icon={<Users size={19} />} text="Adicionar agente" href="/equipe?novo=1" />
            <Quick icon={<WalletCards size={19} />} text="Nova reunião" href="/reunioes?novo=1" />
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
  label,
  value,
  suffix,
  change,
  detail,
  tone,
  href,
  positive,
}: {
  label: string;
  value: string;
  suffix?: string;
  change: string;
  detail: string;
  tone: string;
  href: string;
  positive: boolean;
}) {
  return (
    <Link className={`kpi-card ${tone}`} href={href}>
      <div className="kpi-top">
        <span>{label}</span>
        <ArrowUpRight size={17} />
      </div>
      <div className="kpi-value">
        {value} <small>{suffix}</small>
      </div>
      <div className="kpi-bottom">
        <span className="change" style={positive ? undefined : { color: "#c9563a" }}>
          {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {change}
        </span>
        <span>{detail}</span>
      </div>
    </Link>
  );
}

function Quick({ icon, text, href }: { icon: React.ReactNode; text: string; href: string }) {
  return (
    <Link href={href}>
      <div className="quick-icon">{icon}</div>
      <span>{text}</span>
      <ArrowUpRight size={15} />
    </Link>
  );
}
