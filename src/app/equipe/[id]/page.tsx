"use client";

import { useState, type ChangeEvent } from "react";
import { AppSelect } from "@/components/ui/app-select";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Bot, CalendarDays, Check, CirclePlus, ListTodo, MapPin, Save, UserRound } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useResource } from "@/lib/client";
import { brl, initials } from "@/lib/format";
import { BRAZILIAN_STATE_CAPITALS, BRAZILIAN_STATE_CODES, BRAZILIAN_STATE_NAMES, formatTeamLocation, formatTeamWorkArrangement, legacyStateCode } from "@/lib/locations";
import type { TeamMember, TeamMemberProfile, TeamTask, TeamTaskStatus } from "@/lib/types";
import type { BrazilianStateCode } from "@/lib/locations";

type EditForm = {
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
  status: TeamMember["status"];
  avatarDataUrl: string;
};

type WorkflowPayload = { tasks: TeamTask[] };
type TaskFilter = "ALL" | TeamTaskStatus;

export default function TeamMemberPage() {
  const { id } = useParams<{ id: string }>();
  const { data: member, loading, error } = useResource<TeamMemberProfile>(`/api/team/${encodeURIComponent(id)}`);
  const { data: workflow, loading: tasksLoading, error: tasksError } = useResource<WorkflowPayload>("/api/workflows");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarProcessing, setAvatarProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "tasks">("overview");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("ALL");
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState(() => ({ title: "", details: "", dueDate: localDateKey() }));
  const [taskSaving, setTaskSaving] = useState(false);
  const notify = useToast();

  function beginEditing() {
    if (!member) return;
    setActiveTab("overview");
    setTaskFormOpen(false);
    setForm({
      name: member.name,
      role: member.role,
      email: member.email,
      phone: member.phone,
      department: member.department,
      location: member.location,
      locationState: member.locationState || legacyStateCode(member.location),
      locationCity: member.locationCity || (member.locationState || legacyStateCode(member.location)
        ? BRAZILIAN_STATE_CAPITALS[(member.locationState || legacyStateCode(member.location)) as BrazilianStateCode]
        : ""),
      bio: member.bio ?? "",
      startDate: member.startDate ?? "",
      manager: member.manager ?? "",
      employmentType: member.employmentType ?? "",
      skills: (member.skills ?? []).join(", "),
      type: member.type,
      monthlyCost: String(member.monthlyCost),
      agentProvider: member.agentProvider ?? "",
      agentModel: member.agentModel ?? "",
      agentPurpose: member.agentPurpose ?? "",
      agentIntegrations: (member.agentIntegrations ?? []).join(", "),
      status: member.status,
      avatarDataUrl: member.avatarDataUrl ?? "",
    });
    setEditing(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!member || !form) return;
    setSaving(true);
    try {
      await apiFetch(`/api/team/${encodeURIComponent(member.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          monthlyCost: Number(form.monthlyCost),
          skills: splitTags(form.skills),
          agentIntegrations: splitTags(form.agentIntegrations),
        }),
      });
      setEditing(false);
      setForm(null);
      notify("Perfil atualizado.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao salvar o perfil.", "error");
    } finally {
      setSaving(false);
    }
  }

  function updateForm<Key extends keyof EditForm>(key: Key, value: EditForm[Key]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !form) return;
    if (!file.type.startsWith("image/")) {
      notify("Selecione um arquivo de imagem.", "error");
      return;
    }

    setAvatarProcessing(true);
    try {
      updateForm("avatarDataUrl", await optimizeAvatar(file));
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Não foi possível abrir esta imagem.", "error");
    } finally {
      setAvatarProcessing(false);
    }
  }

  const memberTasks = (workflow?.tasks ?? [])
    .filter((task) => task.assigneeId === member?.id)
    .sort((first, second) => first.dueDate.localeCompare(second.dueDate));
  const visibleTasks = memberTasks
    .filter((task) => taskFilter === "ALL" || task.status === taskFilter);

  async function submitTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member) return;
    setTaskSaving(true);
    try {
      await apiFetch("/api/workflows", {
        method: "POST",
        body: JSON.stringify({
          action: "createTask",
          data: { ...taskDraft, assigneeId: member.id, status: "TODO" },
        }),
      });
      setTaskDraft({ title: "", details: "", dueDate: localDateKey() });
      setTaskFilter("TODO");
      setTaskFormOpen(false);
      notify("Tarefa atribuída ao perfil.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Não foi possível criar a tarefa.", "error");
    } finally {
      setTaskSaving(false);
    }
  }

  async function updateTaskStatus(task: TeamTask, status: TeamTaskStatus) {
    try {
      await apiFetch("/api/workflows", {
        method: "PATCH",
        body: JSON.stringify({ action: "updateTask", id: task.id, data: { status } }),
      });
      notify("Status da tarefa atualizado.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Não foi possível atualizar a tarefa.", "error");
    }
  }

  if (loading) {
    return <div className="page-wrap"><p className="loading">Carregando perfil...</p></div>;
  }

  if (error || !member) {
    return (
      <div className="page-wrap">
        <div className="team-profile-missing card">
          <p className="card-kicker">PERFIL DA EQUIPE</p>
          <h1 className="page-title">Não foi possível abrir este perfil</h1>
          <p className="subtitle">{error ?? "Este integrante não foi encontrado na equipe."}</p>
          <Link className="btn btn-primary" href="/equipe"><ArrowLeft size={16} /> Voltar para a equipe</Link>
        </div>
      </div>
    );
  }

  const isAgent = member.type === "AI";
  const openTaskCount = memberTasks.filter((task) => task.status !== "DONE").length;
  const inProgressCount = memberTasks.filter((task) => task.status === "IN_PROGRESS").length;
  const completedTaskCount = memberTasks.filter((task) => task.status === "DONE").length;
  const location = formatTeamLocation(member);

  return (
    <div className="page-wrap team-profile-page">
      <Link className="team-profile-back" href="/equipe"><ArrowLeft size={16} /> Voltar para a equipe</Link>

      <header className={`team-profile-hero card ${isAgent ? "is-agent" : "is-human"}`}>
        <div className="team-profile-hero-kicker"><span className="card-kicker">{isAgent ? "PERFIL DO AGENTE" : "PERFIL DO FUNCIONÁRIO"}</span><span className={`pill ${member.status === "ACTIVE" ? "green" : "amber"}`}>{member.status === "ACTIVE" ? "Ativo" : "Em revisão"}</span></div>
        <div className="team-profile-heading">
          <div className={`member-avatar team-profile-avatar ${isAgent ? "ai" : ""} ${member.avatarDataUrl ? "has-photo" : ""}`}>
            {member.avatarDataUrl ? <Image src={member.avatarDataUrl} alt={`Foto de ${member.name}`} width={70} height={70} unoptimized /> : isAgent ? <Bot size={25} /> : initials(member.name)}
          </div>
          <div className="team-profile-title">
            <span className={`pill ${isAgent ? "purple" : "blue"}`}>{isAgent ? "Agente de IA" : "Funcionário"}</span>
            <h1 className="page-title">{member.name}</h1>
            <p className="subtitle">{member.role}{member.department ? ` · ${member.department}` : ""}</p>
          </div>
          <div className="team-profile-heading-actions">
            {!editing && <button className="btn btn-primary" onClick={beginEditing}>Editar perfil</button>}
            <button className="btn btn-ghost" type="button" disabled={editing} onClick={() => { setActiveTab("tasks"); setTaskFormOpen(true); }}><CirclePlus size={15} /> Nova tarefa</button>
          </div>
        </div>
        <div className="team-profile-hero-meta">
          {location && <span><MapPin size={14} />{location}</span>}
          {member.email && <span>{member.email}</span>}
          {member.manager && <span>Gestor · {member.manager}</span>}
          {member.startDate && <span>Desde {formatDate(member.startDate)}</span>}
        </div>
      </header>

      <section className="team-profile-metrics" aria-label="Resumo do integrante">
        <article className="card team-profile-metric"><span>Tarefas atribuídas</span><strong>{member.metrics.assignedTasks}</strong><small>{member.metrics.assignedTasks ? `${member.metrics.completionRate}% concluído` : "Acompanhe o trabalho pela Pipeline"}</small></article>
        <article className="card team-profile-metric"><span>Em andamento</span><strong>{inProgressCount}</strong><small>tarefas em execução</small></article>
        <article className="card team-profile-metric"><span>Concluídas</span><strong>{completedTaskCount}</strong><small>tarefas finalizadas</small></article>
        <article className="card team-profile-metric"><span>{isAgent ? "Modelo" : "ROI estimado"}</span><strong>{isAgent ? member.agentModel || "—" : member.metrics.roi == null ? "—" : `${member.metrics.roi}%`}</strong><small>{isAgent ? member.agentProvider || "Modelo do agente" : `${brl(member.metrics.finalizedValue)} em negócios no mês`}</small></article>
      </section>

      <nav className="team-profile-tabs" role="tablist" aria-label="Seções do perfil">
        <button type="button" id="team-profile-tab-overview" role="tab" aria-controls="team-profile-panel-overview" aria-selected={activeTab === "overview"} className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")} disabled={editing}><UserRound size={15} /> Visão geral</button>
        <button type="button" id="team-profile-tab-tasks" role="tab" aria-controls="team-profile-panel-tasks" aria-selected={activeTab === "tasks"} className={activeTab === "tasks" ? "active" : ""} onClick={() => setActiveTab("tasks")} disabled={editing}><ListTodo size={15} /> Tarefas <span>{memberTasks.length}</span></button>
      </nav>

      {editing && form && (
        <form className="card team-profile-edit" onSubmit={submit}>
          <div className="card-head">
            <div>
              <p className="card-kicker">DADOS DO PERFIL</p>
              <h2>Editar informações</h2>
            </div>
            <div className="team-profile-form-actions">
              <button className="btn btn-ghost" type="button" onClick={() => { setEditing(false); setForm(null); }}>Cancelar</button>
              <button className="btn btn-primary" type="submit" disabled={saving || avatarProcessing}>
                <Save size={15} /> {saving ? "Salvando..." : avatarProcessing ? "Preparando foto..." : "Salvar alterações"}
              </button>
            </div>
          </div>
          <div className="team-profile-photo-editor">
            <div className={`member-avatar team-profile-photo-preview ${form.type === "AI" ? "ai" : ""} ${form.avatarDataUrl ? "has-photo" : ""}`}>
              {form.avatarDataUrl ? <Image src={form.avatarDataUrl} alt={`Prévia da foto de ${form.name || "perfil"}`} width={72} height={72} unoptimized /> : form.type === "AI" ? <Bot size={24} /> : initials(form.name || "Perfil")}
            </div>
            <div className="team-profile-photo-copy">
              <label htmlFor="profile-avatar">Foto do perfil</label>
              <input id="profile-avatar" type="file" accept="image/*" onChange={(event) => void chooseAvatar(event)} disabled={avatarProcessing} />
              <span className="small muted">A imagem é ajustada para caber no perfil. Salve as alterações para confirmar.</span>
              {form.avatarDataUrl && <button className="team-profile-photo-remove" type="button" onClick={() => updateForm("avatarDataUrl", "")}>Remover foto</button>}
            </div>
          </div>
          <div className="form-grid team-profile-form-grid">
            <div className="field">
              <label htmlFor="profile-name">Nome</label>
              <input id="profile-name" value={form.name} onChange={(event) => updateForm("name", event.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="profile-role">Função</label>
              <input id="profile-role" value={form.role} onChange={(event) => updateForm("role", event.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="profile-department">Departamento / área</label>
              <input id="profile-department" value={form.department} onChange={(event) => updateForm("department", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="profile-bio">{form.type === "AI" ? "Resumo do agente" : "Sobre o profissional"}</label>
              <textarea id="profile-bio" rows={3} value={form.bio} onChange={(event) => updateForm("bio", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="profile-skills">{form.type === "AI" ? "Capacidades" : "Competências"}</label>
              <input id="profile-skills" value={form.skills} onChange={(event) => updateForm("skills", event.target.value)} placeholder="Separe por vírgulas" />
            </div>
            {form.type === "HUMAN" && (
              <>
                <div className="field">
                  <label htmlFor="profile-email">E-mail de contato</label>
                  <input id="profile-email" type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="profile-phone">Telefone / WhatsApp</label>
                  <input id="profile-phone" type="tel" value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="profile-location-state">Estado</label>
                  <AppSelect id="profile-location-state" value={form.locationState} onChange={(event) => {
                    const state = event.target.value as BrazilianStateCode | "";
                    setForm({ ...form, locationState: state, locationCity: state ? BRAZILIAN_STATE_CAPITALS[state] : "" });
                  }}>
                    <option value="">Selecione o estado</option>
                    {BRAZILIAN_STATE_CODES.map((state) => <option value={state} key={state}>{state} — {BRAZILIAN_STATE_NAMES[state]}</option>)}
                  </AppSelect>
                </div>
                <div className="field">
                  <label htmlFor="profile-location-city">Capital</label>
                  <AppSelect id="profile-location-city" value={form.locationCity} disabled={!form.locationState} onChange={(event) => updateForm("locationCity", event.target.value)}>
                    <option value="">{form.locationState ? "Selecione a capital" : "Selecione primeiro o estado"}</option>
                    {form.locationState && <option value={BRAZILIAN_STATE_CAPITALS[form.locationState]}>{BRAZILIAN_STATE_CAPITALS[form.locationState]}</option>}
                  </AppSelect>
                </div>
                <div className="field">
                  <label htmlFor="profile-location">Unidade / modalidade de trabalho</label>
                  <input id="profile-location" value={form.location} onChange={(event) => updateForm("location", event.target.value)} placeholder="Ex.: escritório, remoto ou híbrido" />
                </div>
                <div className="field">
                  <label htmlFor="profile-start-date">Data de entrada</label>
                  <input id="profile-start-date" type="date" value={form.startDate} onChange={(event) => updateForm("startDate", event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="profile-manager">Gestor responsável</label>
                  <input id="profile-manager" value={form.manager} onChange={(event) => updateForm("manager", event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="profile-employment-type">Tipo de vínculo</label>
                  <AppSelect id="profile-employment-type" value={form.employmentType} onChange={(event) => updateForm("employmentType", event.target.value as EditForm["employmentType"])}>
                    <option value="">Selecione</option>
                    <option value="CLT">CLT</option>
                    <option value="PJ">Pessoa jurídica</option>
                    <option value="INTERN">Estágio</option>
                    <option value="TEMPORARY">Temporário</option>
                    <option value="OTHER">Outro</option>
                  </AppSelect>
                </div>
              </>
            )}
            {form.type === "AI" && (
              <>
                <div className="field">
                  <label htmlFor="profile-agent-provider">Provedor</label>
                  <input id="profile-agent-provider" value={form.agentProvider} onChange={(event) => updateForm("agentProvider", event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="profile-agent-model">Modelo</label>
                  <input id="profile-agent-model" value={form.agentModel} onChange={(event) => updateForm("agentModel", event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="profile-agent-purpose">Objetivo principal</label>
                  <textarea id="profile-agent-purpose" rows={3} value={form.agentPurpose} onChange={(event) => updateForm("agentPurpose", event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="profile-agent-integrations">Integrações / ferramentas</label>
                  <input id="profile-agent-integrations" value={form.agentIntegrations} onChange={(event) => updateForm("agentIntegrations", event.target.value)} placeholder="Separe por vírgulas" />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="profile-type">Tipo</label>
              <AppSelect id="profile-type" value={form.type} onChange={(event) => {
                const type = event.target.value as TeamMember["type"];
                setForm({ ...form, type, ...(type === "AI"
                  ? { email: "", phone: "", location: "", locationState: "" as const, locationCity: "", startDate: "", manager: "", employmentType: "" as const }
                  : { agentProvider: "", agentModel: "", agentPurpose: "", agentIntegrations: "" }) });
              }}>
                <option value="HUMAN">Pessoa</option>
                <option value="AI">Agente de IA</option>
              </AppSelect>
            </div>
            <div className="field">
              <label htmlFor="profile-status">Situação</label>
              <AppSelect id="profile-status" value={form.status} onChange={(event) => updateForm("status", event.target.value as TeamMember["status"])}>
                <option value="ACTIVE">Ativo</option>
                <option value="REVIEW">Em revisão</option>
              </AppSelect>
            </div>
            <div className="field">
              <label htmlFor="profile-cost">{form.type === "AI" ? "Custo mensal do agente (R$)" : "Custo mensal (R$)"}</label>
              <input id="profile-cost" type="number" min="0" value={form.monthlyCost} onChange={(event) => updateForm("monthlyCost", event.target.value)} />
              <span className="small muted">Usado no financeiro e no cálculo automático do ROI.</span>
            </div>
          </div>
        </form>
      )}

      {activeTab === "overview" && !editing && (
        <div className="team-profile-overview-grid" role="tabpanel" id="team-profile-panel-overview" aria-labelledby="team-profile-tab-overview" tabIndex={0}>
          <section className="card team-profile-details">
            <div className="card-head">
              <div><p className="card-kicker">{isAgent ? "CONFIGURAÇÃO DO AGENTE" : "DADOS PROFISSIONAIS"}</p><h2>{isAgent ? "Sobre esta operação" : "Sobre este profissional"}</h2></div>
              <div className="team-profile-type">{isAgent ? <Bot size={17} /> : <UserRound size={17} />}{isAgent ? "Agente de IA" : "Funcionário"}</div>
            </div>
            {member.bio && <p className="team-profile-bio">{member.bio}</p>}
            <dl className="team-profile-data-list">
              <div><dt>Função</dt><dd>{member.role}</dd></div>
              <div><dt>Departamento / área</dt><dd>{member.department || "Não informado"}</dd></div>
              {isAgent ? (
                <>
                  <div><dt>Provedor</dt><dd>{member.agentProvider || "Não informado"}</dd></div>
                  <div><dt>Modelo</dt><dd>{member.agentModel || "Não informado"}</dd></div>
                  {member.agentPurpose && <div className="team-profile-data-wide"><dt>Objetivo principal</dt><dd>{member.agentPurpose}</dd></div>}
                  {member.agentIntegrations?.length ? <div className="team-profile-data-wide"><dt>Integrações / ferramentas</dt><dd>{member.agentIntegrations.join(", ")}</dd></div> : null}
                  <div className="team-profile-data-wide"><dt>Capacidades</dt><dd>{member.skills?.length ? member.skills.join(", ") : "Não informado"}</dd></div>
                </>
              ) : (
                <>
                  <div><dt>E-mail</dt><dd>{member.email || "Não informado"}</dd></div>
                  <div><dt>Telefone / WhatsApp</dt><dd>{member.phone || "Não informado"}</dd></div>
                  <div><dt>Estado e capital</dt><dd>{location || "Não informado"}</dd></div>
                  <div><dt>Unidade / modalidade</dt><dd>{formatTeamWorkArrangement(member) || "Não informado"}</dd></div>
                  <div><dt>Data de entrada</dt><dd>{member.startDate ? formatDate(member.startDate) : "Não informado"}</dd></div>
                  <div><dt>Gestor responsável</dt><dd>{member.manager || "Não informado"}</dd></div>
                  <div><dt>Tipo de vínculo</dt><dd>{employmentTypeLabel(member.employmentType ?? "")}</dd></div>
                  <div className="team-profile-data-wide"><dt>Competências</dt><dd>{member.skills?.length ? member.skills.join(", ") : "Não informado"}</dd></div>
                </>
              )}
              <div><dt>Custo mensal</dt><dd>{brl(member.monthlyCost)}</dd></div>
            </dl>
          </section>

          <aside className="card team-profile-task-summary">
            <div className="card-head"><div><p className="card-kicker">ROTINA</p><h2>Próximas tarefas</h2></div><span className="team-profile-task-count">{openTaskCount} abertas</span></div>
            {tasksError ? <p className="form-error">{tasksError}</p> : tasksLoading ? <p className="loading">Carregando tarefas...</p> : memberTasks.filter((task) => task.status !== "DONE").slice(0, 4).length ? (
              <div className="team-profile-task-preview">
                {memberTasks.filter((task) => task.status !== "DONE").slice(0, 4).map((task) => (
                  <article key={task.id}>
                    <span className={`team-task-status status-${task.status.toLowerCase()}`}>{taskStatusLabel(task.status)}</span>
                    <div><strong>{task.title}</strong><small><CalendarDays size={12} /> Prazo {formatDate(task.dueDate)}</small></div>
                  </article>
                ))}
              </div>
            ) : <div className="team-profile-empty"><ListTodo size={19} /><span>Ainda não há tarefas atribuídas.</span></div>}
            <button type="button" className="btn btn-ghost team-profile-view-tasks" onClick={() => setActiveTab("tasks")}>Ver todas as tarefas <ListTodo size={15} /></button>
            {!isAgent && <p className="team-profile-roi-note">ROI e negócios finalizados são calculados automaticamente com os dados do Pipeline.</p>}
          </aside>
        </div>
      )}

      {activeTab === "tasks" && (
        <section className="card team-profile-tasks" role="tabpanel" id="team-profile-panel-tasks" aria-labelledby="team-profile-tab-tasks" tabIndex={0}>
          <div className="team-profile-tasks-heading">
            <div><p className="card-kicker">ROTINA DA EQUIPE</p><h2>Tarefas de {member.name}</h2><p>O que está pendente, em andamento e concluído para este perfil.</p></div>
            <div className="team-profile-task-actions">
              <Link className="btn btn-ghost" href="/pipeline"><ListTodo size={15} /> Abrir Pipeline</Link>
              <button className="btn btn-primary" type="button" onClick={() => setTaskFormOpen((open) => !open)}><CirclePlus size={15} /> {taskFormOpen ? "Fechar formulário" : "Nova tarefa"}</button>
            </div>
          </div>

          {taskFormOpen && (
            <form className="team-profile-task-form" onSubmit={submitTask}>
              <div className="team-profile-task-form-heading"><div><strong>Atribuir tarefa a {member.name}</strong><span>Ela também aparecerá na Pipeline da equipe.</span></div><span className={`pill ${isAgent ? "purple" : "blue"}`}>{isAgent ? "Agente IA" : "Funcionário"}</span></div>
              <div className="team-profile-task-form-grid">
                <label className="field team-profile-task-title"><span>Tarefa</span><input maxLength={120} required value={taskDraft.title} onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })} placeholder="Ex.: Preparar o relatório semanal" /></label>
                <label className="field"><span>Prazo</span><input type="date" required value={taskDraft.dueDate} onChange={(event) => setTaskDraft({ ...taskDraft, dueDate: event.target.value })} /></label>
                <label className="field team-profile-task-details"><span>Detalhes</span><input maxLength={500} value={taskDraft.details} onChange={(event) => setTaskDraft({ ...taskDraft, details: event.target.value })} placeholder="Contexto ou instruções" /></label>
              </div>
              <div className="team-profile-task-form-footer"><span><UserRound size={14} /> Responsável: {member.name}</span><button className="btn btn-primary" type="submit" disabled={taskSaving}>{taskSaving ? "Salvando..." : "Atribuir tarefa"}</button></div>
            </form>
          )}

          <div className="team-profile-task-toolbar">
            <div className="team-profile-task-filters" role="group" aria-label="Filtrar tarefas do perfil">
              {([
                ["ALL", "Todas", memberTasks.length],
                ["TODO", "A fazer", memberTasks.filter((task) => task.status === "TODO").length],
                ["IN_PROGRESS", "Em andamento", inProgressCount],
                ["DONE", "Concluídas", completedTaskCount],
              ] as const).map(([value, label, count]) => (
                <button type="button" key={value} className={taskFilter === value ? "active" : ""} aria-pressed={taskFilter === value} onClick={() => setTaskFilter(value)}>{label}<span>{count}</span></button>
              ))}
            </div>
            <span className="team-profile-task-total">{memberTasks.length} tarefas registradas</span>
          </div>

          {tasksError ? <p className="form-error">{tasksError}</p> : tasksLoading ? <p className="loading">Carregando tarefas...</p> : visibleTasks.length ? (
            <div className="team-profile-task-list">
              {visibleTasks.map((task) => (
                <article className={`team-profile-task-row status-${task.status.toLowerCase()}`} key={task.id}>
                  <span className={`team-profile-task-marker status-${task.status.toLowerCase()}`}>{task.status === "DONE" ? <Check size={17} /> : <ListTodo size={16} />}</span>
                  <div className="team-profile-task-copy"><div><span className={`team-task-status status-${task.status.toLowerCase()}`}>{taskStatusLabel(task.status)}</span><small><CalendarDays size={12} /> Prazo {formatDate(task.dueDate)}</small></div><h3>{task.title}</h3><p>{task.details || "Sem detalhes cadastrados."}</p></div>
                  <label className="team-profile-task-status-control"><span>Status</span><AppSelect aria-label={`Status da tarefa ${task.title}`} value={task.status} onChange={(event) => void updateTaskStatus(task, event.target.value as TeamTaskStatus)}><option value="TODO">A fazer</option><option value="IN_PROGRESS">Em andamento</option><option value="DONE">Concluída</option></AppSelect></label>
                </article>
              ))}
            </div>
          ) : (
            <div className="team-profile-empty team-profile-task-empty"><ListTodo size={25} /><strong>{memberTasks.length ? "Nenhuma tarefa nessa etapa" : "Nenhuma tarefa atribuída ainda"}</strong><span>{memberTasks.length ? "Escolha outra categoria para consultar as tarefas." : "Crie uma tarefa aqui ou atribua este perfil pela Pipeline."}</span></div>
          )}
        </section>
      )}
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
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function taskStatusLabel(status: TeamTaskStatus) {
  if (status === "DONE") return "Concluída";
  if (status === "IN_PROGRESS") return "Fazendo";
  return "A fazer";
}

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function optimizeAvatar(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    for (const maxDimension of [480, 360, 280]) {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível preparar a foto.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const avatarDataUrl = canvas.toDataURL("image/jpeg", 0.78);
      if (avatarDataUrl.length <= 560_000) return avatarDataUrl;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("Esta imagem ainda ficou grande demais. Escolha uma foto menor.");
}
