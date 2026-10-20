"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bot,
  CalendarDays,
  ChevronRight,
  DollarSign,
  Gauge as GaugeIcon,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Target,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { Donut } from "@/components/ui/donut";
import { BarChart } from "@/components/ui/bar-chart";
import { Gauge } from "@/components/ui/gauge";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useResource } from "@/lib/client";
import { brl, initials } from "@/lib/format";
import type { TeamMember, TeamMemberProfile } from "@/lib/types";

type Summary = {
  total: number;
  humans: number;
  agents: number;
  monthlyCost: number;
  humanCost: number;
  agentCost: number;
  assignedTasks: number;
  completedTasks: number;
  averagePerformance: number;
  averageRoi: number | null;
};

type Payload = { team: TeamMemberProfile[]; summary: Summary; costAutomation: boolean };

const EMPTY_FORM = {
  name: "",
  role: "",
  email: "",
  phone: "",
  department: "",
  location: "",
  type: "HUMAN" as TeamMember["type"],
  monthlyCost: "",
};

type Filter = "todos" | "HUMAN" | "AI" | "baixo" | "custo";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "HUMAN", label: "Funcionários" },
  { key: "AI", label: "Agentes IA" },
  { key: "baixo", label: "Tarefas pendentes" },
  { key: "custo", label: "Alto custo" },
];

export default function EquipePage() {
  const { data, loading, error } = useResource<Payload>("/api/team");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<{ title: string; body: string } | null>(null);
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

  async function patch(member: TeamMemberProfile, body: Partial<TeamMember>) {
    try {
      await apiFetch(`/api/team/${member.id}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao atualizar.", "error");
    }
  }

  async function remove(member: TeamMemberProfile) {
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
      if (filter === "baixo") return member.metrics.assignedTasks > 0 && member.metrics.completionRate < 100;
      if (filter === "custo") return member.monthlyCost > averageCost;
      return true;
    })
    .filter((member) =>
      query.trim() ? `${member.name} ${member.role} ${member.department} ${member.location} ${member.email}`.toLowerCase().includes(query.trim().toLowerCase()) : true,
    );

  const agents = all.filter((member) => member.type === "AI");
  const activeAgents = agents.filter((member) => member.status === "ACTIVE");
  const agentCost = activeAgents.reduce((sum, member) => sum + member.monthlyCost, 0);

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <h1 className="page-title">Gestão de Funcionários e Agentes</h1>
          <p className="subtitle">Acompanhe os dados profissionais, tarefas e resultados da equipe.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setFormOpen((open) => !open)}>
          {formOpen ? <X size={16} /> : <Plus size={16} />} {formOpen ? "Cancelar" : "Adicionar"}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <section className="kpi-grid team-kpis">
        <SummaryCard
          icon={<Users size={22} />}
          tone="blue"
          label="Total na Equipe"
          value={String(summary?.total ?? 0)}
          hint={`${summary?.humans ?? 0} humanos · ${summary?.agents ?? 0} agentes IA`}
          onClick={() => setDetail({ title: "Total na equipe", body: `${summary?.humans ?? 0} pessoas e ${summary?.agents ?? 0} agentes de IA cadastrados.` })}
        />
        <SummaryCard
          icon={<DollarSign size={22} />}
          tone="amber"
          label="Custo Total Mensal"
          value={brl(summary?.monthlyCost ?? 0)}
          hint={`Agentes ${brl(summary?.agentCost ?? 0)} · Pessoas ${brl(summary?.humanCost ?? 0)}`}
          onClick={() => setDetail({ title: "Custo total mensal", body: `O custo mensal estimado é ${brl(summary?.monthlyCost ?? 0)}, sendo ${brl(summary?.humanCost ?? 0)} em pessoas e ${brl(summary?.agentCost ?? 0)} em agentes.` })}
        />
        <SummaryCard
          icon={<GaugeIcon size={22} />}
          tone="purple"
          label="Desempenho médio"
          value={summary?.assignedTasks ? `${summary.averagePerformance}%` : "—"}
          hint={`${summary?.completedTasks ?? 0} de ${summary?.assignedTasks ?? 0} tarefas atribuídas`}
          meter={summary?.assignedTasks ? summary.averagePerformance : undefined}
          onClick={() => setDetail({ title: "Desempenho médio", body: `A taxa é calculada automaticamente com base em tarefas concluídas e atribuídas: ${summary?.completedTasks ?? 0} de ${summary?.assignedTasks ?? 0}.` })}
        />
        <SummaryCard
          icon={<Target size={22} />}
          tone="green"
          label="ROI estimado"
          value={summary?.averageRoi == null ? "—" : `${summary.averageRoi}%`}
          hint={summary?.averageRoi == null ? "informe o custo para calcular" : "negócios finalizados ÷ custo mensal"}
          meter={summary?.averageRoi == null ? undefined : Math.min(100, summary.averageRoi)}
          onClick={() => setDetail({ title: "ROI estimado", body: summary?.averageRoi == null
            ? "Informe o custo mensal das pessoas para que o sistema calcule o retorno sobre os negócios finalizados."
            : `Calculado automaticamente pelo valor de negócios finalizados neste mês dividido pelo custo mensal cadastrado. ROI atual: ${summary.averageRoi}%.` })}
        />
      </section>

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setDetail(null)} aria-label="Fechar detalhes"><X size={18} /></button>
            <p className="card-kicker">VISÃO DETALHADA</p>
            <h2 id="detail-title">{detail.title}</h2>
            <p>{detail.body}</p>
            <div className="modal-chart">
              <BarChart
                labels={all.slice(0, 8).map((member) => member.name)}
                series={[
                  { label: "Concluídas", values: all.slice(0, 8).map((member) => member.metrics.completedTasks), color: "#8b5cf6" },
                  { label: "Atribuídas", values: all.slice(0, 8).map((member) => member.metrics.assignedTasks), color: "#22c55e" },
                ]}
                height={180}
              />
            </div>
            <button className="btn btn-primary" onClick={() => setDetail(null)}>Entendi</button>
          </section>
        </div>
      )}

      {formOpen && (
        <form className="inline-form section team-form" onSubmit={submit}>
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
              <label htmlFor="department">Departamento / área</label>
              <input
                id="department"
                value={form.department}
                onChange={(event) => setForm({ ...form, department: event.target.value })}
                placeholder="Comercial"
              />
            </div>
            {form.type === "HUMAN" && (
              <>
                <div className="field">
                  <label htmlFor="email">E-mail de contato</label>
                  <input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="pessoa@empresa.com"
                  />
                </div>
                <div className="field">
                  <label htmlFor="phone">Telefone / WhatsApp</label>
                  <input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div className="field">
                  <label htmlFor="location">Local de trabalho</label>
                  <input
                    id="location"
                    value={form.location}
                    onChange={(event) => setForm({ ...form, location: event.target.value })}
                    placeholder="São Paulo · Híbrido"
                  />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="type">Tipo</label>
              <select
                id="type"
                value={form.type}
                onChange={(event) => {
                  const type = event.target.value as TeamMember["type"];
                  setForm({ ...form, type, ...(type === "AI" ? { email: "", phone: "", location: "" } : {}) });
                }}
              >
                <option value="HUMAN">Pessoa</option>
                <option value="AI">Agente de IA</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="monthlyCost">{form.type === "AI" ? "Custo mensal do agente (R$)" : "Custo mensal (R$)"}</label>
              <input
                id="monthlyCost"
                type="number"
                min="0"
                value={form.monthlyCost}
                onChange={(event) => setForm({ ...form, monthlyCost: event.target.value })}
              />
              <span className="small muted">Usado no financeiro e no cálculo automático do ROI.</span>
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Adicionar ao time"}
            </button>
          </div>
        </form>
      )}

      <section className="section split team-layout">
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
              const profileHref = `/equipe/${encodeURIComponent(member.id)}`;
              return (
                <article className="member-card" key={member.id}>
                  <div className="member-top">
                    <div className={`member-avatar ${member.type === "AI" ? "ai" : ""}`}>
                      {member.type === "AI" ? <Bot size={20} /> : initials(member.name)}
                    </div>
                    <div className="member-info" style={{ flex: 1, minWidth: 0 }}>
                      <span className={`pill ${member.type === "AI" ? "purple" : "blue"}`}>
                        {member.type === "AI" ? "Agente IA" : "Humano"}
                      </span>
                      <strong>{member.name}</strong>
                      <span>{member.role}</span>
                      {member.department && <span className="member-department">{member.department}</span>}
                    </div>
                    <button className="icon-action danger" onClick={() => remove(member)} title="Remover">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {member.type === "HUMAN" && (
                    <div className="member-contact">
                      <span><Mail size={13} />{member.email || "E-mail não informado"}</span>
                      <span><Phone size={13} />{member.phone || "Telefone não informado"}</span>
                      {member.location && <span><MapPin size={13} />{member.location}</span>}
                    </div>
                  )}

                  {member.type === "HUMAN" && (
                    <div className="member-next-task">
                      <CalendarDays size={14} />
                      {member.metrics.nextTaskTitle ? (
                        <span><b>Próxima:</b> {member.metrics.nextTaskTitle} · {formatDate(member.metrics.nextTaskDueDate)}</span>
                      ) : (
                        <span>Sem tarefa pendente</span>
                      )}
                    </div>
                  )}

                  {member.type === "HUMAN" ? (
                    <div className="member-gauges">
                      {member.metrics.assignedTasks > 0 ? (
                        <Gauge value={member.metrics.completionRate} label="Conclusão de tarefas" />
                      ) : (
                        <div className="member-auto-notice">Sem tarefas atribuídas</div>
                      )}
                      <div className="member-auto-metric">
                        <span>ROI estimado</span>
                        <strong>{member.metrics.roi == null ? "—" : `${member.metrics.roi}%`}</strong>
                        <small>{brl(member.metrics.finalizedValue)} finalizados no mês</small>
                      </div>
                    </div>
                  ) : (
                    <div className="member-auto-notice">Indicadores de uso do agente ainda não são registrados.</div>
                  )}

                  <div className="member-foot">
                    <Link className="member-open-link" href={profileHref}>
                      Abrir perfil <ChevronRight size={15} />
                    </Link>
                    <span className={`pill ${verdict.tone}`}>{verdict.text}</span>
                    <b>{brl(member.monthlyCost)}</b>
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
              <h2>Custos dos Agentes IA</h2>
            </div>
            <div className="big-number">{brl(agentCost)}</div>
            <p className="small muted" style={{ marginTop: 8 }}>
              Custo mensal informado para os agentes ativos.
            </p>
            <div style={{ marginTop: 16 }}>
              <div className="list-item">
                <div className="grow">
                  <strong>Agentes ativos</strong>
                </div>
                <b style={{ fontSize: 13 }}>{activeAgents.length}</b>
              </div>
              <div className="list-item">
                <div className="grow">
                  <strong>Custo mensal informado</strong>
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

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/** Sinaliza apenas o que pode ser observado nos registros atuais. */
function judge(member: TeamMemberProfile) {
  const { assignedTasks, completedTasks, completionRate, roi } = member.metrics;
  if (member.type === "AI") return { tone: "blue", text: "USO NÃO RASTREADO" };
  if (assignedTasks === 0) return { tone: "blue", text: "AGUARDANDO · Sem tarefas" };
  if (completionRate < 100) return { tone: "amber", text: `${assignedTasks - completedTasks} tarefa(s) em aberto` };
  if (roi === null) return { tone: "blue", text: "Custo mensal não informado" };
  if (roi >= 200) return { tone: "green", text: "ROI acima de 200%" };
  if (roi >= 100) return { tone: "green", text: "ROI acima de 100%" };
  return { tone: "blue", text: "Tarefas concluídas" };
}

function SummaryCard({
  icon,
  tone,
  label,
  value,
  hint,
  meter,
  onClick,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
  hint: string;
  meter?: number;
  onClick?: () => void;
}) {
  return (
    <button className="kpi-card kpi-card-button" onClick={onClick} type="button">
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
    </button>
  );
}
