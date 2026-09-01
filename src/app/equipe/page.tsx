"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  ChevronRight,
  DollarSign,
  Gauge as GaugeIcon,
  Plus,
  Search,
  Target,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { Donut } from "@/components/ui/donut";
import { Gauge } from "@/components/ui/gauge";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useResource } from "@/lib/client";
import { brl, initials, percent } from "@/lib/format";
import type { TeamMember } from "@/lib/types";

type Summary = {
  total: number;
  humans: number;
  agents: number;
  monthlyCost: number;
  humanCost: number;
  agentCost: number;
  averagePerformance: number;
  averageRoi: number;
  onTarget: number;
};

type Payload = { team: TeamMember[]; summary: Summary; costAutomation: boolean };

const EMPTY_FORM = {
  name: "",
  role: "",
  type: "HUMAN" as TeamMember["type"],
  performance: "",
  target: "",
  monthlyCost: "",
  generatedValue: "",
  roi: "",
};

type Filter = "todos" | "HUMAN" | "AI" | "baixo" | "custo";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "HUMAN", label: "Funcionários" },
  { key: "AI", label: "Agentes IA" },
  { key: "baixo", label: "Baixo desempenho" },
  { key: "custo", label: "Alto custo" },
];

export default function EquipePage() {
  const { data, loading, error } = useResource<Payload>("/api/team");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");
  const notify = useToast();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("novo")) setFormOpen(true);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/api/team", { method: "POST", body: JSON.stringify(form) });
      notify(form.type === "AI" ? "Agente adicionado." : "Integrante adicionado.", "success");
      setForm(EMPTY_FORM);
      setFormOpen(false);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao salvar.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function patch(member: TeamMember, body: Partial<TeamMember>) {
    try {
      await apiFetch(`/api/team/${member.id}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao atualizar.", "error");
    }
  }

  async function remove(member: TeamMember) {
    if (!window.confirm(`Remover ${member.name} da equipe?`)) return;
    try {
      await apiFetch(`/api/team/${member.id}`, { method: "DELETE" });
      notify("Removido da equipe.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao remover.", "error");
    }
  }

  const summary = data?.summary;
  const all = data?.team ?? [];
  const averageCost = all.length ? all.reduce((sum, member) => sum + member.monthlyCost, 0) / all.length : 0;

  const team = all
    .filter((member) => {
      if (filter === "HUMAN" || filter === "AI") return member.type === filter;
      if (filter === "baixo") return member.performance < member.target;
      if (filter === "custo") return member.monthlyCost > averageCost;
      return true;
    })
    .filter((member) =>
      query.trim() ? `${member.name} ${member.role}`.toLowerCase().includes(query.trim().toLowerCase()) : true,
    );

  const agents = all.filter((member) => member.type === "AI");
  const agentValue = agents.reduce((sum, member) => sum + (member.generatedValue ?? 0), 0);
  const agentCost = agents.reduce((sum, member) => sum + member.monthlyCost, 0);
  const savings = agentValue - agentCost;

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <h1 className="page-title">Gestão de Funcionários e Agentes</h1>
          <p className="subtitle">Acompanhe o desempenho da equipe, custos e produtividade com dados reais.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setFormOpen((open) => !open)}>
          {formOpen ? <X size={16} /> : <Plus size={16} />} {formOpen ? "Cancelar" : "Adicionar"}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <section className="kpi-grid">
        <SummaryCard
          icon={<Users size={22} />}
          tone="blue"
          label="Total na Equipe"
          value={String(summary?.total ?? 0)}
          hint={`${summary?.humans ?? 0} humanos · ${summary?.agents ?? 0} agentes IA`}
        />
        <SummaryCard
          icon={<DollarSign size={22} />}
          tone="amber"
          label="Custo Total Mensal"
          value={brl(summary?.monthlyCost ?? 0)}
          hint={`Agentes ${brl(summary?.agentCost ?? 0)} · Pessoas ${brl(summary?.humanCost ?? 0)}`}
        />
        <SummaryCard
          icon={<GaugeIcon size={22} />}
          tone="purple"
          label="Desempenho Médio"
          value={`${summary?.averagePerformance ?? 0}%`}
          hint={`${summary?.onTarget ?? 0} de ${summary?.total ?? 0} dentro da meta`}
          meter={summary?.averagePerformance ?? 0}
        />
        <SummaryCard
          icon={<Target size={22} />}
          tone="green"
          label="Meta"
          value={`${summary?.averageRoi ?? 0}%`}
          hint="retorno estimado sobre o custo"
          meter={Math.min(100, summary?.averageRoi ?? 0)}
        />
      </section>

      {formOpen && (
        <form className="inline-form section" onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="name">Nome</label>
              <input
                id="name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Mariana Costa"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="role">Função</label>
              <input
                id="role"
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value })}
                placeholder="Head de Marketing"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="type">Tipo</label>
              <select
                id="type"
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value as TeamMember["type"] })}
              >
                <option value="HUMAN">Pessoa</option>
                <option value="AI">Agente de IA</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="monthlyCost">Custo mensal (R$)</label>
              <input
                id="monthlyCost"
                type="number"
                min="0"
                value={form.monthlyCost}
                onChange={(event) => setForm({ ...form, monthlyCost: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="generatedValue">Valor gerado (R$)</label>
              <input
                id="generatedValue"
                type="number"
                min="0"
                value={form.generatedValue}
                onChange={(event) => setForm({ ...form, generatedValue: event.target.value })}
                placeholder="12500"
              />
            </div>
            <div className="field">
              <label htmlFor="performance">Desempenho (%)</label>
              <input
                id="performance"
                type="number"
                min="0"
                max="100"
                value={form.performance}
                onChange={(event) => setForm({ ...form, performance: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="target">Meta (%)</label>
              <input
                id="target"
                type="number"
                min="0"
                max="100"
                value={form.target}
                onChange={(event) => setForm({ ...form, target: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="roi">ROI (%)</label>
              <input
                id="roi"
                type="number"
                min="0"
                value={form.roi}
                onChange={(event) => setForm({ ...form, roi: event.target.value })}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Adicionar ao time"}
            </button>
          </div>
        </form>
      )}

      <section className="section split">
        <div>
          <div className="section-head">
            <div className="tabs">
              {FILTERS.map((entry) => (
                <button
                  key={entry.key}
                  className={`tab ${filter === entry.key ? "active" : ""}`}
                  onClick={() => setFilter(entry.key)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <div className="search-field" style={{ maxWidth: 240 }}>
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar membro..."
                aria-label="Buscar membro"
              />
            </div>
          </div>

          <div className="member-grid">
            {team.map((member) => {
              const verdict = judge(member);
              return (
                <article className="member-card" key={member.id}>
                  <div className="member-top">
                    <div className={`member-avatar ${member.type === "AI" ? "ai" : ""}`}>
                      {member.type === "AI" ? <Bot size={20} /> : initials(member.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className={`pill ${member.type === "AI" ? "purple" : "blue"}`}>
                        {member.type === "AI" ? "Agente IA" : "Humano"}
                      </span>
                      <strong style={{ marginTop: 7 }}>{member.name}</strong>
                      <span>{member.role}</span>
                    </div>
                    <button className="icon-action danger" onClick={() => remove(member)} title="Remover">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="member-gauges">
                    <Gauge value={member.performance} label="Desempenho" />
                    <Gauge
                      value={member.target ? (member.performance / member.target) * 100 : 0}
                      label="Meta batida"
                      color={member.performance >= member.target ? "#22c55e" : "#f5a524"}
                    />
                  </div>

                  <div className="member-foot">
                    <span className={`pill ${verdict.tone}`}>{verdict.text}</span>
                    <b>{brl(member.monthlyCost)}</b>
                    <b style={{ color: member.roi >= 100 ? "#4ade80" : "#f7b955" }}>{member.roi}%</b>
                  </div>

                  <button
                    className={`pill ${member.status === "ACTIVE" ? "green" : "amber"}`}
                    onClick={() => patch(member, { status: member.status === "ACTIVE" ? "REVIEW" : "ACTIVE" })}
                    style={{ alignSelf: "flex-start" }}
                  >
                    {member.status === "ACTIVE" ? "Ativo" : "Em revisão"}
                  </button>
                </article>
              );
            })}
          </div>

          {!loading && !team.length && (
            <p className="empty">
              {all.length ? "Nenhum integrante neste filtro." : "Nenhum integrante cadastrado ainda."}
            </p>
          )}
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          <div className="card">
            <div className="card-head">
              <h2>Distribuição da Equipe</h2>
            </div>
            {summary?.total ? (
              <Donut
                slices={[
                  { label: "Humanos", value: summary.humans, color: "#2563eb" },
                  { label: "Agentes IA", value: summary.agents, color: "#8b5cf6" },
                ]}
                centerValue={String(summary.total)}
                centerLabel="Membros"
                size={168}
              />
            ) : (
              <p className="empty">Sem integrantes cadastrados.</p>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Economia com Agentes IA</h2>
            </div>
            <div className="big-number" style={{ color: savings >= 0 ? "#4ade80" : "#ff8f7a" }}>
              {brl(savings)}
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>
              Valor gerado pelos agentes menos o custo mensal deles.
            </p>
            <div style={{ marginTop: 16 }}>
              <div className="list-item">
                <div className="grow">
                  <strong>Valor gerado</strong>
                  <div className="bar green">
                    <span style={{ width: `${agentValue ? 100 : 0}%` }} />
                  </div>
                </div>
                <b style={{ fontSize: 13 }}>{brl(agentValue)}</b>
              </div>
              <div className="list-item">
                <div className="grow">
                  <strong>Custo dos agentes</strong>
                  <div className="bar amber">
                    <span style={{ width: `${agentValue ? Math.min(100, (agentCost / agentValue) * 100) : 0}%` }} />
                  </div>
                </div>
                <b style={{ fontSize: 13 }}>{brl(agentCost)}</b>
              </div>
            </div>
            {data?.costAutomation && (
              <p className="small muted" style={{ marginTop: 14 }}>
                O custo do time entra automaticamente como despesa do mês no Relatório.
              </p>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Ações Rápidas</h2>
            </div>
            <div style={{ marginTop: 8 }}>
              <button
                className="action-row"
                style={{ width: "100%" }}
                onClick={() => {
                  setForm({ ...EMPTY_FORM, type: "HUMAN" });
                  setFormOpen(true);
                }}
              >
                <div className="icon">
                  <User size={18} />
                </div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <strong>Adicionar Funcionário</strong>
                  <span>Convide um novo membro humano</span>
                </div>
                <ChevronRight size={16} color="#6b7d9c" />
              </button>
              <button
                className="action-row"
                style={{ width: "100%" }}
                onClick={() => {
                  setForm({ ...EMPTY_FORM, type: "AI" });
                  setFormOpen(true);
                }}
              >
                <div className="icon">
                  <Bot size={18} />
                </div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <strong>Criar Agente de IA</strong>
                  <span>Cadastre um novo agente inteligente</span>
                </div>
                <ChevronRight size={16} color="#6b7d9c" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Veredito do integrante calculado a partir de meta, desempenho e retorno. */
function judge(member: TeamMember) {
  if (member.performance < member.target) {
    return { tone: "amber", text: `AVALIAR · ${percent(member.target - member.performance, 0)} abaixo da meta` };
  }
  if (member.roi >= 200) return { tone: "green", text: "SIM · Excelente ROI" };
  if (member.roi >= 100) return { tone: "green", text: "SIM · Boa performance" };
  return { tone: "blue", text: "OK · Dentro da meta" };
}

function SummaryCard({
  icon,
  tone,
  label,
  value,
  hint,
  meter,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
  hint: string;
  meter?: number;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-head">
        <div className={`kpi-icon ${tone}`}>{icon}</div>
        <div>
          <div className="kpi-label">{label}</div>
          <div className="kpi-value">{value}</div>
        </div>
      </div>
      <div className="kpi-meter">
        {meter !== undefined && (
          <div className="bar">
            <span style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
          </div>
        )}
        <span>{hint}</span>
      </div>
    </div>
  );
}
