"use client";

import { useState } from "react";
import { AppSelect } from "@/components/ui/app-select";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Bot, CalendarDays, ListTodo, Save, UserRound } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useResource } from "@/lib/client";
import { brl, initials } from "@/lib/format";
import type { TeamMember, TeamMemberProfile, TeamTask, TeamTaskStatus } from "@/lib/types";

type EditForm = {
  name: string;
  role: string;
  email: string;
  phone: string;
  department: string;
  location: string;
  type: TeamMember["type"];
  monthlyCost: string;
  status: TeamMember["status"];
};

type WorkflowPayload = { tasks: TeamTask[] };
type ActivityFilter = "ALL" | "OPEN" | "DONE";

export default function TeamMemberPage() {
  const { id } = useParams<{ id: string }>();
  const { data: member, loading, error } = useResource<TeamMemberProfile>(`/api/team/${encodeURIComponent(id)}`);
  const { data: workflow, loading: tasksLoading, error: tasksError } = useResource<WorkflowPayload>("/api/workflows");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("ALL");
  const notify = useToast();

  function beginEditing() {
    if (!member) return;
    setForm({
      name: member.name,
      role: member.role,
      email: member.email,
      phone: member.phone,
      department: member.department,
      location: member.location,
      type: member.type,
      monthlyCost: String(member.monthlyCost),
      status: member.status,
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

  const memberTasks = (workflow?.tasks ?? [])
    .filter((task) => task.assigneeId === member?.id)
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  const visibleTasks = memberTasks.filter((task) => {
    if (activityFilter === "DONE") return task.status === "DONE";
    if (activityFilter === "OPEN") return task.status !== "DONE";
    return true;
  }).slice(0, 9);

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

  return (
    <div className="page-wrap team-profile-page">
      <Link className="team-profile-back" href="/equipe"><ArrowLeft size={16} /> Voltar para a equipe</Link>

      <header className="team-profile-heading">
        <div className={`member-avatar team-profile-avatar ${isAgent ? "ai" : ""}`}>
          {isAgent ? <Bot size={21} /> : initials(member.name)}
        </div>
        <div className="team-profile-title">
          <p className="card-kicker">{isAgent ? "AGENTE DE IA" : "PERFIL DO FUNCIONÁRIO"}</p>
          <h1 className="page-title">{member.name}</h1>
          <p className="subtitle">{member.role}</p>
        </div>
        <div className="team-profile-heading-actions">
          <span className={`pill ${member.status === "ACTIVE" ? "green" : "amber"}`}>
            {member.status === "ACTIVE" ? "Ativo" : "Em revisão"}
          </span>
          {!isAgent && <Link className="btn btn-ghost" href="/pipeline"><ListTodo size={15} /> Ver tarefas</Link>}
          {!editing && <button className="btn btn-primary" onClick={beginEditing}>Editar perfil</button>}
        </div>
      </header>

      <section className="team-profile-metrics" aria-label="Resumo do integrante">
        {isAgent ? (
          <article className="card team-profile-metric">
            <span>Indicadores de uso</span>
            <strong>Sem registros</strong>
            <span>O sistema ainda não acompanha atividades automáticas dos agentes.</span>
          </article>
        ) : (
          <>
            <article className="card team-profile-metric">
              <span>Meta de tarefas</span>
              <strong>{member.metrics.assignedTasks}</strong>
              <span>total atribuído à pessoa</span>
            </article>
            <article className="card team-profile-metric">
              <span>Tarefas concluídas</span>
              <strong>{member.metrics.completedTasks}</strong>
            </article>
            <article className="card team-profile-metric">
              <span>Conclusão</span>
              <strong>{member.metrics.assignedTasks ? `${member.metrics.completionRate}%` : "—"}</strong>
            </article>
            <article className="card team-profile-metric">
              <span>Negócios finalizados no mês</span>
              <strong>{brl(member.metrics.finalizedValue)}</strong>
            </article>
            <article className="card team-profile-metric">
              <span>ROI estimado</span>
              <strong>{member.metrics.roi == null ? "—" : `${member.metrics.roi}%`}</strong>
            </article>
          </>
        )}
      </section>

      {!isAgent && (
        <section className="card team-profile-activity">
          <div className="card-head team-profile-activity-head">
            <div>
              <p className="card-kicker">HISTÓRICO DE TRABALHO</p>
              <h2>Atividades recentes</h2>
            </div>
            <div className="tabs" role="group" aria-label="Filtrar atividades">
              {([
                ["ALL", "Todas"],
                ["OPEN", "Em aberto"],
                ["DONE", "Concluídas"],
              ] as const).map(([filter, label]) => (
                <button
                  key={filter}
                  className={`tab ${activityFilter === filter ? "active" : ""}`}
                  onClick={() => setActivityFilter(filter)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {tasksError ? (
            <p className="form-error">{tasksError}</p>
          ) : tasksLoading ? (
            <p className="loading">Carregando tarefas...</p>
          ) : visibleTasks.length ? (
            <div className="team-task-history-grid">
              {visibleTasks.map((task) => (
                <article className="team-task-history-card" key={task.id}>
                  <div className="team-task-history-meta">
                    <span className={`team-task-status status-${task.status.toLowerCase()}`}>{taskStatusLabel(task.status)}</span>
                    <span><CalendarDays size={13} /> Prazo {formatDate(task.dueDate)}</span>
                  </div>
                  <h3>{task.title}</h3>
                  <p>{task.details || "Sem detalhes cadastrados."}</p>
                  <small>Atualizada em {formatDate(task.updatedAt.slice(0, 10))}</small>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty">
              {memberTasks.length ? "Nenhuma tarefa neste filtro." : "Nenhuma tarefa atribuída a este funcionário ainda."}
            </p>
          )}
        </section>
      )}

      {editing && form && (
        <form className="card team-profile-edit" onSubmit={submit}>
          <div className="card-head">
            <div>
              <p className="card-kicker">DADOS DO PERFIL</p>
              <h2>Editar informações</h2>
            </div>
            <div className="team-profile-form-actions">
              <button className="btn btn-ghost" type="button" onClick={() => { setEditing(false); setForm(null); }}>Cancelar</button>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                <Save size={15} /> {saving ? "Salvando..." : "Salvar alterações"}
              </button>
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
                  <label htmlFor="profile-location">Local de trabalho</label>
                  <input id="profile-location" value={form.location} onChange={(event) => updateForm("location", event.target.value)} placeholder="São Paulo · Híbrido" />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="profile-type">Tipo</label>
              <AppSelect id="profile-type" value={form.type} onChange={(event) => {
                const type = event.target.value as TeamMember["type"];
                setForm({ ...form, type, ...(type === "AI" ? { email: "", phone: "", location: "" } : {}) });
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

      {!editing && (
        <section className="card team-profile-details">
          <div className="card-head">
            <div>
              <p className="card-kicker">INFORMAÇÕES DO CADASTRO</p>
              <h2>{isAgent ? "Dados de operação" : "Dados pessoais e profissionais"}</h2>
            </div>
            <div className="team-profile-type">
              {isAgent ? <Bot size={17} /> : <UserRound size={17} />}
              {isAgent ? "Agente de IA" : "Funcionário"}
            </div>
          </div>
          <dl className="team-profile-data-list">
            <div><dt>Nome</dt><dd>{member.name}</dd></div>
            <div><dt>Função</dt><dd>{member.role}</dd></div>
            <div><dt>Departamento / área</dt><dd>{member.department || "Não informado"}</dd></div>
            {!isAgent && <div><dt>E-mail</dt><dd>{member.email || "Não informado"}</dd></div>}
            {!isAgent && <div><dt>Telefone / WhatsApp</dt><dd>{member.phone || "Não informado"}</dd></div>}
            {!isAgent && <div><dt>Local de trabalho</dt><dd>{member.location || "Não informado"}</dd></div>}
            <div><dt>Situação</dt><dd>{member.status === "ACTIVE" ? "Ativo" : "Em revisão"}</dd></div>
            <div><dt>Custo mensal registrado</dt><dd>{brl(member.monthlyCost)}</dd></div>
            {!isAgent && (
              <div>
                <dt>Próxima tarefa</dt>
                <dd>{member.metrics.nextTaskTitle
                  ? `${member.metrics.nextTaskTitle} · ${formatDate(member.metrics.nextTaskDueDate)}`
                  : "Sem tarefa pendente"}</dd>
              </div>
            )}
          </dl>
          <p className="small muted team-profile-metric-note">
            {isAgent
              ? "Os indicadores de uso do agente aparecerão aqui quando o sistema passar a registrar as atividades dele."
              : "Conclusão de tarefas e ROI são calculados pelo sistema com base nas tarefas atribuídas e nos negócios finalizados neste mês."}
          </p>
        </section>
      )}
    </div>
  );
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
