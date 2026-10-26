"use client";

import { useEffect, useState } from "react";
import { AppSelect } from "@/components/ui/app-select";
import Link from "next/link";
import Image from "next/image";
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
import { BRAZILIAN_STATE_CAPITALS, BRAZILIAN_STATE_CODES, BRAZILIAN_STATE_NAMES, formatTeamLocation } from "@/lib/locations";
import type { TeamMember, TeamMemberProfile, TeamTask } from "@/lib/types";
import type { BrazilianStateCode } from "@/lib/locations";

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
type WorkflowPayload = { tasks: TeamTask[] };

type TeamForm = {
  name: string;
  role: string;
  email: string;
  phone: string;
  department: string;
  location: string;
  locationState: BrazilianStateCode | "";
  locationCity: string;
  bio: string;
  startDate: string;
  manager: string;
  employmentType: NonNullable<TeamMember["employmentType"]>;
  skills: string;
  type: TeamMember["type"];
  monthlyCost: string;
  agentProvider: string;
  agentModel: string;
  agentPurpose: string;
  agentIntegrations: string;
};

const EMPTY_FORM: TeamForm = {
  name: "",
  role: "",
  email: "",
  phone: "",
  department: "",
  location: "",
  locationState: "",
  locationCity: "",
  bio: "",
  startDate: "",
  manager: "",
  employmentType: "",
  skills: "",
  type: "HUMAN" as TeamMember["type"],
  monthlyCost: "",
  agentProvider: "",
  agentModel: "",
  agentPurpose: "",
  agentIntegrations: "",
};

type Filter = "todos" | "HUMAN" | "AI" | "pendentes" | "custo";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "HUMAN", label: "Funcionários" },
  { key: "AI", label: "Agentes IA" },
  { key: "pendentes", label: "Tarefas pendentes" },
  { key: "custo", label: "Alto custo" },
];

export default function EquipePage() {
  const { data, loading, error } = useResource<Payload>("/api/team");
  const { data: workflow, loading: tasksLoading, error: tasksError } = useResource<WorkflowPayload>("/api/workflows");
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
      await apiFetch("/api/team", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          skills: splitTags(form.skills),
          agentIntegrations: splitTags(form.agentIntegrations),
        }),
      });
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
  const memberById = new Map(all.map((member) => [member.id, member]));
  const pendingTasks = (workflow?.tasks ?? [])
    .filter((task) => task.status !== "DONE" && task.assigneeId !== null && memberById.has(task.assigneeId))
    .sort((first, second) => first.dueDate.localeCompare(second.dueDate));
  const pendingMemberIds = new Set(pendingTasks.map((task) => task.assigneeId));
  const highCostMembers = all
    .filter((member) => member.monthlyCost > 0)
    .sort((first, second) => second.monthlyCost - first.monthlyCost)
    .slice(0, 5);

  const team = all
    .filter((member) => {
      if (filter === "HUMAN" || filter === "AI") return member.type === filter;
      if (filter === "pendentes") return pendingMemberIds.has(member.id);
      if (filter === "custo") return member.monthlyCost > 0 && member.monthlyCost >= averageCost;
      return true;
    })
    .filter((member) =>
      query.trim()
        ? `${member.name} ${member.role} ${member.department} ${formatTeamLocation(member)} ${member.email} ${member.manager ?? ""} ${member.bio ?? ""} ${(member.skills ?? []).join(" ")} ${member.agentProvider ?? ""} ${member.agentModel ?? ""} ${member.agentPurpose ?? ""} ${(member.agentIntegrations ?? []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())
        : true,
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
        <form className="section card team-form" onSubmit={submit}>
          <div className="team-form-heading">
            <div>
              <p className="card-kicker">NOVO CADASTRO</p>
              <h2>{form.type === "AI" ? "Criar agente de IA" : "Adicionar funcionário"}</h2>
              <p>Preencha o perfil para organizar pessoas, responsabilidades e custos da equipe.</p>
            </div>
            <button className="icon-action" type="button" aria-label="Fechar cadastro" onClick={() => setFormOpen(false)}>
              <X size={17} />
            </button>
          </div>
          <div className="team-form-type-switch" role="group" aria-label="Tipo de cadastro">
            <button
              className={form.type === "HUMAN" ? "active" : ""}
              type="button"
              aria-pressed={form.type === "HUMAN"}
              onClick={() => setForm({ ...form, type: "HUMAN", agentProvider: "", agentModel: "", agentPurpose: "", agentIntegrations: "" })}
            >
              <User size={16} /> Funcionário
            </button>
            <button
              className={form.type === "AI" ? "active" : ""}
              type="button"
              aria-pressed={form.type === "AI"}
              onClick={() => setForm({ ...form, type: "AI", email: "", phone: "", location: "", locationState: "", locationCity: "", startDate: "", manager: "", employmentType: "" })}
            >
              <Bot size={16} /> Agente de IA
            </button>
          </div>

          <div className="team-form-section">
            <div className="team-form-section-heading">
              <span>01</span>
              <div><h3>Identificação</h3><p>Informações principais do perfil.</p></div>
            </div>
            <div className="form-grid team-form-grid">
              <div className="field">
                <label htmlFor="team-name">Nome</label>
                <input id="team-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={form.type === "AI" ? "Agente de atendimento" : "Mariana Costa"} required />
              </div>
              <div className="field">
                <label htmlFor="team-role">{form.type === "AI" ? "Função do agente" : "Cargo / função"}</label>
                <input id="team-role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder={form.type === "AI" ? "Atendimento e suporte" : "Head de Marketing"} required />
              </div>
              <div className="field">
                <label htmlFor="team-department">Departamento / área</label>
                <input id="team-department" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} placeholder="Comercial" />
              </div>
              <div className="field team-form-wide-field">
                <label htmlFor="team-bio">{form.type === "AI" ? "Resumo do agente" : "Sobre o profissional"}</label>
                <textarea id="team-bio" value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} placeholder="Contexto, especialidade e responsabilidades principais" rows={3} />
              </div>
              <div className="field team-form-wide-field">
                <label htmlFor="team-skills">{form.type === "AI" ? "Capacidades" : "Competências"}</label>
                <input id="team-skills" value={form.skills} onChange={(event) => setForm({ ...form, skills: event.target.value })} placeholder="Separe por vírgulas · Ex.: CRM, análise, atendimento" />
                <span className="field-hint">Você pode adicionar até 12 itens.</span>
              </div>
            </div>
          </div>

          {form.type === "HUMAN" ? (
            <div className="team-form-section">
              <div className="team-form-section-heading">
                <span>02</span>
                <div><h3>Dados profissionais</h3><p>Contato, vínculo e organização.</p></div>
              </div>
              <div className="form-grid team-form-grid">
                <div className="field">
                  <label htmlFor="team-email">E-mail de contato</label>
                  <input id="team-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="pessoa@empresa.com" />
                </div>
                <div className="field">
                  <label htmlFor="team-phone">Telefone / WhatsApp</label>
                  <input id="team-phone" type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="(11) 99999-9999" />
                </div>
                <div className="field">
                  <label htmlFor="team-location-state">Estado</label>
                  <AppSelect id="team-location-state" value={form.locationState} onChange={(event) => {
                    const state = event.target.value as BrazilianStateCode | "";
                    setForm({ ...form, locationState: state, locationCity: state ? BRAZILIAN_STATE_CAPITALS[state] : "" });
                  }}>
                    <option value="">Selecione o estado</option>
                    {BRAZILIAN_STATE_CODES.map((state) => <option value={state} key={state}>{state} — {BRAZILIAN_STATE_NAMES[state]}</option>)}
                  </AppSelect>
                </div>
                <div className="field">
                  <label htmlFor="team-location-city">Capital</label>
                  <AppSelect id="team-location-city" value={form.locationCity} disabled={!form.locationState} onChange={(event) => setForm({ ...form, locationCity: event.target.value })}>
                    <option value="">{form.locationState ? "Selecione a capital" : "Selecione primeiro o estado"}</option>
                    {form.locationState && <option value={BRAZILIAN_STATE_CAPITALS[form.locationState]}>{BRAZILIAN_STATE_CAPITALS[form.locationState]}</option>}
                  </AppSelect>
                </div>
                <div className="field team-form-wide-field">
                  <label htmlFor="team-location">Unidade / modalidade de trabalho</label>
                  <input id="team-location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Ex.: escritório, remoto ou híbrido" />
                </div>
                <div className="field">
                  <label htmlFor="team-start-date">Data de entrada</label>
                  <input id="team-start-date" type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="team-manager">Gestor responsável</label>
                  <input id="team-manager" value={form.manager} onChange={(event) => setForm({ ...form, manager: event.target.value })} placeholder="Nome da liderança" />
                </div>
                <div className="field">
                  <label htmlFor="team-employment-type">Tipo de vínculo</label>
                  <AppSelect id="team-employment-type" value={form.employmentType} onChange={(event) => setForm({ ...form, employmentType: event.target.value as TeamForm["employmentType"] })}>
                    <option value="">Selecione</option>
                    <option value="CLT">CLT</option>
                    <option value="PJ">Pessoa jurídica</option>
                    <option value="INTERN">Estágio</option>
                    <option value="TEMPORARY">Temporário</option>
                    <option value="OTHER">Outro</option>
                  </AppSelect>
                </div>
              </div>
            </div>
          ) : (
            <div className="team-form-section">
              <div className="team-form-section-heading">
                <span>02</span>
                <div><h3>Configuração do agente</h3><p>Objetivo, modelo e ferramentas conectadas.</p></div>
              </div>
              <div className="form-grid team-form-grid">
                <div className="field">
                  <label htmlFor="team-agent-provider">Provedor</label>
                  <input id="team-agent-provider" value={form.agentProvider} onChange={(event) => setForm({ ...form, agentProvider: event.target.value })} placeholder="OpenAI, Anthropic..." />
                </div>
                <div className="field">
                  <label htmlFor="team-agent-model">Modelo</label>
                  <input id="team-agent-model" value={form.agentModel} onChange={(event) => setForm({ ...form, agentModel: event.target.value })} placeholder="Nome do modelo" />
                </div>
                <div className="field team-form-wide-field">
                  <label htmlFor="team-agent-purpose">Objetivo principal</label>
                  <textarea id="team-agent-purpose" value={form.agentPurpose} onChange={(event) => setForm({ ...form, agentPurpose: event.target.value })} placeholder="O que este agente deve fazer pela empresa?" rows={3} />
                </div>
                <div className="field team-form-wide-field">
                  <label htmlFor="team-agent-integrations">Integrações / ferramentas</label>
                  <input id="team-agent-integrations" value={form.agentIntegrations} onChange={(event) => setForm({ ...form, agentIntegrations: event.target.value })} placeholder="Separe por vírgulas · Ex.: CRM, agenda, e-mail" />
                </div>
              </div>
            </div>
          )}

          <div className="team-form-section team-form-cost-section">
            <div className="team-form-section-heading">
              <span>03</span>
              <div><h3>Investimento mensal</h3><p>Usado na visão de custos e no cálculo do ROI.</p></div>
            </div>
            <div className="field team-form-cost-field">
              <label htmlFor="team-monthly-cost">{form.type === "AI" ? "Custo mensal do agente (R$)" : "Custo mensal (R$)"}</label>
              <input id="team-monthly-cost" type="number" min="0" step="0.01" value={form.monthlyCost} onChange={(event) => setForm({ ...form, monthlyCost: event.target.value })} placeholder="0,00" />
            </div>
          </div>
          <div className="team-form-actions">
            <button className="btn btn-ghost" type="button" onClick={() => { setForm(EMPTY_FORM); setFormOpen(false); }}>Cancelar</button>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Salvando..." : form.type === "AI" ? "Criar agente" : "Adicionar funcionário"}
            </button>
          </div>
        </form>
      )}

      <section className="section split team-analytics">
        <div className="card team-distribution">
          <div className="card-head">
            <div><p className="card-kicker">COMPOSIÇÃO</p><h2>Distribuição da equipe</h2></div>
            <span className="team-count-pill">{summary?.total ?? 0} integrantes</span>
          </div>
          {summary?.total ? (
            <Donut
              slices={[
                { label: "Funcionários", value: summary.humans, color: "#2563eb" },
                { label: "Agentes IA", value: summary.agents, color: "#8b5cf6" },
              ]}
              centerValue={String(summary.total)}
              centerLabel="Na equipe"
              size={184}
            />
          ) : (
            <div className="team-empty-chart"><Users size={22} /><span>Cadastre pessoas ou agentes para ver a distribuição.</span></div>
          )}
        </div>

        <div className="card team-savings">
          <div className="card-head">
            <div><p className="card-kicker">CUSTOS E ATALHOS</p><h2>Visão da operação</h2></div>
            <span className="team-cost-icon"><DollarSign size={17} /></span>
          </div>
          <div className="team-cost-overview">
            <div><span>Custo mensal ativo</span><strong>{brl(summary?.monthlyCost ?? 0)}</strong></div>
            <div><span>Agentes ativos</span><strong>{activeAgents.length}</strong></div>
            <div><span>Custo de agentes</span><strong>{brl(agentCost)}</strong></div>
          </div>
          {data?.costAutomation && <p className="small muted team-savings-note">Os custos cadastrados entram automaticamente como despesa mensal no Relatório.</p>}
          <div className="team-quick-actions">
            <button className="action-row" onClick={() => { setForm({ ...EMPTY_FORM, type: "HUMAN" }); setFormOpen(true); }}>
              <span className="icon"><User size={18} /></span>
              <span className="team-action-copy"><strong>Adicionar funcionário</strong><small>Perfil, contato e vínculo</small></span>
              <ChevronRight size={16} />
            </button>
            <button className="action-row" onClick={() => { setForm({ ...EMPTY_FORM, type: "AI" }); setFormOpen(true); }}>
              <span className="icon"><Bot size={18} /></span>
              <span className="team-action-copy"><strong>Criar agente de IA</strong><small>Modelo, objetivo e integrações</small></span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      <section className="section card team-directory-section">
        <div className="team-directory-heading">
          <div>
            <p className="card-kicker">DIRETÓRIO DA EQUIPE</p>
            <h2>Pessoas e agentes</h2>
            <p>Abra cada perfil para consultar atividades e atualizar os dados.</p>
          </div>
          <div className="search-field team-directory-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, área ou função" aria-label="Buscar integrante" />
          </div>
        </div>
        <div className="team-directory-toolbar">
          <div className="tabs team-directory-tabs" role="group" aria-label="Filtrar equipe">
            {FILTERS.map((entry) => (
              <button key={entry.key} type="button" className={`tab ${filter === entry.key ? "active" : ""}`} aria-pressed={filter === entry.key} onClick={() => setFilter(entry.key)}>
                {entry.label}{entry.key === "pendentes" && pendingTasks.length > 0 ? ` · ${pendingTasks.length}` : ""}
              </button>
            ))}
          </div>
          <span className="team-directory-count">{team.length} de {all.length} integrantes</span>
        </div>

        <div className="member-grid">
          {team.map((member) => {
            const verdict = judge(member);
            const profileHref = `/equipe/${encodeURIComponent(member.id)}`;
            const memberSkills = member.skills ?? [];
            const location = formatTeamLocation(member);
            return (
              <article className={`member-card ${member.type === "AI" ? "is-agent" : "is-human"}`} key={member.id}>
                <div className="member-top">
                  <div className={`member-avatar ${member.type === "AI" ? "ai" : ""} ${member.avatarDataUrl ? "has-photo" : ""}`}>
                    {member.avatarDataUrl ? <Image src={member.avatarDataUrl} alt={`Foto de ${member.name}`} width={54} height={54} unoptimized /> : member.type === "AI" ? <Bot size={21} /> : initials(member.name)}
                  </div>
                  <div className="member-info">
                    <span className={`pill ${member.type === "AI" ? "purple" : "blue"}`}>{member.type === "AI" ? "Agente IA" : "Funcionário"}</span>
                    <strong>{member.name}</strong>
                    <span>{member.role}</span>
                    {member.department && <span className="member-department">{member.department}</span>}
                  </div>
                  <button className="icon-action danger" onClick={() => remove(member)} title="Remover" aria-label={`Remover ${member.name}`}>
                    <Trash2 size={14} />
                  </button>
                </div>

                {member.bio && <p className="member-bio">{member.bio}</p>}

                {member.type === "HUMAN" ? (
                  <>
                    <div className="member-contact">
                      {member.email && <span><Mail size={13} />{member.email}</span>}
                      {member.phone && <span><Phone size={13} />{member.phone}</span>}
                      {location && <span><MapPin size={13} />{location}</span>}
                    </div>
                    <div className="member-profile-meta">
                      {member.employmentType && <span><small>Vínculo</small><b>{employmentTypeLabel(member.employmentType)}</b></span>}
                      {member.manager && <span><small>Liderança</small><b>{member.manager}</b></span>}
                      {member.startDate && <span><small>Entrada</small><b>{formatDate(member.startDate)}</b></span>}
                    </div>
                    <div className="member-next-task">
                      <CalendarDays size={14} />
                      {member.metrics.nextTaskTitle ? (
                        <span><b>Próxima tarefa:</b> {member.metrics.nextTaskTitle} · {formatDate(member.metrics.nextTaskDueDate)}</span>
                      ) : (
                        <span>Sem tarefa pendente</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="member-agent-meta">
                    <span><small>Provedor</small><b>{member.agentProvider || "Não informado"}</b></span>
                    <span><small>Modelo</small><b>{member.agentModel || "Não informado"}</b></span>
                    {member.agentPurpose && <p>{member.agentPurpose}</p>}
                    {(member.agentIntegrations ?? []).length > 0 && (
                      <div className="member-skill-list" aria-label="Integrações">
                        {(member.agentIntegrations ?? []).map((integration) => <span key={integration}>{integration}</span>)}
                      </div>
                    )}
                  </div>
                )}

                {memberSkills.length > 0 && (
                  <div className="member-skill-list" aria-label={member.type === "AI" ? "Capacidades" : "Competências"}>
                    {memberSkills.map((skill) => <span key={skill}>{skill}</span>)}
                  </div>
                )}

                {member.type === "HUMAN" ? (
                  <div className="member-gauges">
                    {member.metrics.assignedTasks > 0 ? <Gauge value={member.metrics.completionRate} label="Tarefas concluídas" /> : <div className="member-auto-notice">Sem tarefas atribuídas</div>}
                    <div className="member-auto-metric">
                      <span>ROI estimado</span>
                      <strong>{member.metrics.roi == null ? "—" : `${member.metrics.roi}%`}</strong>
                      <small>{brl(member.metrics.finalizedValue)} finalizados no mês</small>
                    </div>
                  </div>
                ) : (
                  <div className="member-gauges">
                    {member.metrics.assignedTasks > 0 ? <Gauge value={member.metrics.completionRate} label="Tarefas concluídas" /> : <div className="member-auto-notice">Sem tarefas atribuídas</div>}
                    <div className="member-auto-metric">
                      <span>Tarefas em aberto</span>
                      <strong>{member.metrics.assignedTasks - member.metrics.completedTasks}</strong>
                      <small>Acompanhe pela Pipeline</small>
                    </div>
                  </div>
                )}

                <div className="member-foot">
                  <Link className="member-open-link" href={profileHref}>Abrir perfil <ChevronRight size={15} /></Link>
                  <button className={`pill ${member.status === "ACTIVE" ? "green" : "amber"}`} type="button" onClick={() => patch(member, { status: member.status === "ACTIVE" ? "REVIEW" : "ACTIVE" })}>
                    {member.status === "ACTIVE" ? "Ativo" : "Em revisão"}
                  </button>
                  <div className="member-card-cost"><small>Custo / mês</small><b>{brl(member.monthlyCost)}</b></div>
                </div>
                <span className={`member-verdict ${verdict.tone}`}>{verdict.text}</span>
              </article>
            );
          })}
        </div>

        {!loading && !team.length && (
          <div className="team-directory-empty">
            <Users size={23} />
            <strong>{all.length ? "Nenhum integrante neste filtro" : "Sua equipe começa aqui"}</strong>
            <span>{all.length ? "Tente outra categoria ou busca." : "Adicione um funcionário ou crie um agente para preencher o diretório."}</span>
          </div>
        )}
      </section>

      <section className="section split team-insights-grid">
        <div className="card team-pending-panel">
          <div className="card-head">
            <div><p className="card-kicker">ACOMPANHAMENTO</p><h2>Tarefas pendentes</h2><p>Atividades que ainda precisam ser concluídas pela equipe.</p></div>
            <Link className="team-panel-link" href="/pipeline">Ver tarefas <ChevronRight size={15} /></Link>
          </div>
          {tasksError ? <p className="form-error">{tasksError}</p> : tasksLoading ? <p className="loading">Carregando tarefas...</p> : pendingTasks.length ? (
            <div className="team-pending-list">
              {pendingTasks.slice(0, 6).map((task) => {
                const assignee = task.assigneeId ? memberById.get(task.assigneeId) : undefined;
                return (
                  <article className="team-pending-task" key={task.id}>
                    <span className={`team-task-status status-${task.status.toLowerCase()}`}>{task.status === "IN_PROGRESS" ? "Em andamento" : "A fazer"}</span>
                    <div className="team-pending-task-copy">
                      <strong>{task.title}</strong>
                      <span>{assignee ? <Link href={`/equipe/${encodeURIComponent(assignee.id)}`}>{assignee.name}</Link> : "Sem responsável"}{task.details ? ` · ${task.details}` : ""}</span>
                    </div>
                    <span className="team-pending-due"><CalendarDays size={13} />{formatDate(task.dueDate)}</span>
                  </article>
                );
              })}
            </div>
          ) : <div className="team-insight-empty"><CalendarDays size={19} /><span>Nenhuma tarefa pendente atribuída à equipe.</span></div>}
        </div>

        <div className="card team-cost-panel">
          <div className="card-head">
            <div><p className="card-kicker">INVESTIMENTO</p><h2>Maiores custos mensais</h2><p>Funcionários e agentes ordenados pelo valor cadastrado.</p></div>
            <strong className="team-cost-total">{brl(summary?.monthlyCost ?? 0)}</strong>
          </div>
          {highCostMembers.length ? (
            <div className="team-cost-list">
              {highCostMembers.map((member, index) => (
                <Link className="team-cost-row" href={`/equipe/${encodeURIComponent(member.id)}`} key={member.id}>
                  <span className={`team-cost-rank rank-${index + 1}`}>{String(index + 1).padStart(2, "0")}</span>
                  <span className={`team-cost-avatar ${member.type === "AI" ? "ai" : ""}`}>{member.type === "AI" ? <Bot size={15} /> : initials(member.name)}</span>
                  <span className="team-cost-copy"><b>{member.name}</b><small>{member.type === "AI" ? "Agente IA" : member.role}</small></span>
                  <strong>{brl(member.monthlyCost)}</strong>
                </Link>
              ))}
            </div>
          ) : <div className="team-insight-empty"><DollarSign size={19} /><span>Cadastre o custo mensal para comparar os investimentos.</span></div>}
          {data?.costAutomation && <p className="small muted team-cost-note">Os custos ativos são lançados automaticamente no Relatório Financeiro.</p>}
        </div>
      </section>
    </div>
  );
}

function splitTags(value: string) {
  return [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))].slice(0, 12);
}

function employmentTypeLabel(value: NonNullable<TeamMember["employmentType"]>) {
  const labels: Record<NonNullable<TeamMember["employmentType"]>, string> = {
    CLT: "CLT",
    PJ: "Pessoa jurídica",
    INTERN: "Estágio",
    TEMPORARY: "Temporário",
    OTHER: "Outro",
    "": "Não informado",
  };
  return labels[value];
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/** Sinaliza apenas o que pode ser observado nos registros atuais. */
function judge(member: TeamMemberProfile) {
  const { assignedTasks, completedTasks, completionRate, roi } = member.metrics;
  if (assignedTasks === 0) return { tone: "blue", text: "AGUARDANDO · Sem tarefas" };
  if (completionRate < 100) return { tone: "amber", text: `${assignedTasks - completedTasks} tarefa(s) em aberto` };
  if (member.type === "AI") return { tone: "green", text: "Tarefas concluídas" };
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
