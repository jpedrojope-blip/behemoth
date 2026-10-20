"use client";

import { useState } from "react";
import { AppSelect } from "@/components/ui/app-select";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CircleCheck,
  ClipboardList,
  GripVertical,
  Handshake,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useResource } from "@/lib/client";
import { brl, initials } from "@/lib/format";
import type { PipelineStage, PipelineTone, SalesOpportunity, TeamMember, TeamTask, TeamTaskStatus } from "@/lib/types";

type WorkflowData = { tasks: TeamTask[]; stages: PipelineStage[]; opportunities: SalesOpportunity[] };
type TeamData = { team: TeamMember[] };
type BoardView = "team" | "sales";

const TASK_COLUMNS: { status: TeamTaskStatus; label: string; hint: string }[] = [
  { status: "TODO", label: "A fazer", hint: "Aguardando início" },
  { status: "IN_PROGRESS", label: "Fazendo", hint: "Em andamento" },
  { status: "DONE", label: "Feito", hint: "Concluído" },
];

const STAGE_TONES: { value: PipelineTone; label: string }[] = [
  { value: "blue", label: "Azul" },
  { value: "violet", label: "Violeta" },
  { value: "amber", label: "Âmbar" },
  { value: "green", label: "Verde" },
  { value: "rose", label: "Rosa" },
];

const EMPTY_TASK = { title: "", details: "", assigneeId: "", dueDate: "" };
const EMPTY_OPPORTUNITY = {
  title: "",
  company: "",
  contact: "",
  amount: "",
  ownerId: "",
  nextStep: "",
  dueDate: "",
  stageId: "",
};
const EMPTY_TASKS: TeamTask[] = [];

export function PipelineBoard() {
  const { data, loading, error } = useResource<WorkflowData>("/api/workflows");
  const { data: teamData } = useResource<TeamData>("/api/team");
  const [view, setView] = useState<BoardView>("team");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState(EMPTY_TASK);
  const [taskFormStatus, setTaskFormStatus] = useState<TeamTaskStatus>("TODO");
  const [showOpportunityForm, setShowOpportunityForm] = useState(false);
  const [editingOpportunityId, setEditingOpportunityId] = useState<string | null>(null);
  const [opportunityForm, setOpportunityForm] = useState(EMPTY_OPPORTUNITY);
  const [showStageForm, setShowStageForm] = useState(false);
  const [stageName, setStageName] = useState("");
  const [stageTone, setStageTone] = useState<PipelineTone>("amber");
  const [saving, setSaving] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const notify = useToast();

  const team = (teamData?.team ?? []).filter((member) => member.type === "HUMAN");
  const tasks = data?.tasks ?? EMPTY_TASKS;
  const stages = data?.stages ?? [];
  const opportunities = data?.opportunities ?? [];
  const today = localDateKey();

  const visibleTasks = assigneeFilter === "all" ? tasks : tasks.filter((task) => task.assigneeId === assigneeFilter);
  const overdueTasks = tasks.filter((task) => task.status !== "DONE" && task.dueDate < today).length;
  const activeTasks = tasks.filter((task) => task.status !== "DONE").length;
  const salesValue = opportunities.reduce((total, opportunity) => total + opportunity.amount, 0);

  async function mutate(body: object, successMessage: string) {
    setSaving(true);
    try {
      const action = "action" in body ? String(body.action) : "";
      const method = action.startsWith("create") ? "POST" : action.startsWith("update") ? "PATCH" : "DELETE";
      await apiFetch("/api/workflows", { method, body: JSON.stringify(body) });
      notify(successMessage, "success");
      return true;
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Não foi possível salvar.", "error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openTaskForm(task?: TeamTask, initialStatus: TeamTaskStatus = "TODO") {
    setEditingTaskId(task?.id ?? null);
    setTaskFormStatus(task?.status ?? initialStatus);
    setTaskForm(task
      ? { title: task.title, details: task.details, assigneeId: task.assigneeId ?? "", dueDate: task.dueDate }
      : EMPTY_TASK);
    setShowTaskForm(true);
  }

  async function submitTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dataToSave = { ...taskForm, assigneeId: taskForm.assigneeId || null, status: taskFormStatus };
    const saved = await mutate(editingTaskId
      ? { action: "updateTask", id: editingTaskId, data: dataToSave }
      : { action: "createTask", data: dataToSave }, editingTaskId ? "Tarefa atualizada." : "Tarefa criada.");
    if (saved) {
      setShowTaskForm(false);
      setEditingTaskId(null);
      setTaskForm(EMPTY_TASK);
    }
  }

  function openOpportunityForm(opportunity?: SalesOpportunity) {
    setEditingOpportunityId(opportunity?.id ?? null);
    setOpportunityForm(opportunity
      ? {
          title: opportunity.title,
          company: opportunity.company,
          contact: opportunity.contact,
          amount: opportunity.amount ? String(opportunity.amount) : "",
          ownerId: opportunity.ownerId ?? "",
          nextStep: opportunity.nextStep,
          dueDate: opportunity.dueDate,
          stageId: opportunity.stageId,
        }
      : { ...EMPTY_OPPORTUNITY, stageId: stages[0]?.id ?? "" });
    setShowOpportunityForm(true);
  }

  async function submitOpportunity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { amount, ownerId, ...rest } = opportunityForm;
    const dataToSave = { ...rest, amount: Number(amount) || 0, ownerId: ownerId || null };
    const saved = await mutate(editingOpportunityId
      ? { action: "updateOpportunity", id: editingOpportunityId, data: dataToSave }
      : { action: "createOpportunity", data: dataToSave }, editingOpportunityId ? "Negócio atualizado." : "Negócio criado.");
    if (saved) {
      setShowOpportunityForm(false);
      setEditingOpportunityId(null);
      setOpportunityForm(EMPTY_OPPORTUNITY);
    }
  }

  async function submitStage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stageName.trim()) return;
    const saved = await mutate({ action: "createStage", data: { name: stageName, tone: stageTone } }, "Etapa adicionada.");
    if (saved) {
      setShowStageForm(false);
      setStageName("");
    }
  }

  async function removeStage(stage: PipelineStage) {
    const destination = stages.find((item) => item.id !== stage.id);
    if (!destination) return;
    const moving = opportunities.filter((opportunity) => opportunity.stageId === stage.id).length;
    const message = moving
      ? `Remover “${stage.name}”? ${moving} negócio(s) serão movidos para “${destination.name}”.`
      : `Remover a etapa “${stage.name}”?`;
    if (!window.confirm(message)) return;
    await mutate({ entity: "stage", id: stage.id, moveToStageId: destination.id }, "Etapa removida.");
  }

  async function removeCard(entity: "task" | "opportunity", id: string, title: string) {
    if (!window.confirm(`Excluir “${title}”?`)) return;
    await mutate({ entity, id }, entity === "task" ? "Tarefa excluída." : "Negócio excluído.");
  }

  async function moveTask(id: string, status: TeamTaskStatus) {
    await mutate({ action: "updateTask", id, data: { status } }, "Status da tarefa atualizado.");
  }

  async function moveOpportunity(id: string, stageId: string) {
    await mutate({ action: "updateOpportunity", id, data: { stageId } }, "Negócio movido.");
  }

  function dragId(event: React.DragEvent<HTMLElement>) {
    return event.dataTransfer.getData("text/plain");
  }

  return (
    <div className="page-wrap pipeline-page">
      <div className="page-head pipeline-page-head">
        <div>
          <p className="eyebrow">ROTINA E VENDAS</p>
          <h1 className="page-title">Pipeline</h1>
          <p className="subtitle">Organize o que cada pessoa precisa fazer e acompanhe seus negócios por etapa.</p>
        </div>
        {view === "team" ? (
          <button className="btn btn-primary" onClick={() => showTaskForm ? setShowTaskForm(false) : openTaskForm()}>
            {showTaskForm ? <X size={16} /> : <Plus size={16} />}{showTaskForm ? "Fechar" : "Nova tarefa"}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => showOpportunityForm ? setShowOpportunityForm(false) : openOpportunityForm()}>
            {showOpportunityForm ? <X size={16} /> : <Plus size={16} />}{showOpportunityForm ? "Fechar" : "Novo negócio"}
          </button>
        )}
      </div>

      <div className="pipeline-tabs" role="group" aria-label="Quadros do pipeline">
        <button className={view === "team" ? "active" : ""} type="button" aria-pressed={view === "team"} onClick={() => setView("team")}>
          <ClipboardList size={16} /> Tarefas da equipe
        </button>
        <button className={view === "sales" ? "active" : ""} type="button" aria-pressed={view === "sales"} onClick={() => setView("sales")}>
          <Handshake size={16} /> Pipeline comercial
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && !data && <p className="loading">Carregando seu pipeline...</p>}

      {view === "team" ? (
        <>
          <section className="workflow-summary" aria-label="Resumo das tarefas">
            <div className="workflow-summary-card">
              <span className="workflow-summary-icon blue"><ClipboardList size={17} /></span>
              <div><small>Tarefas em aberto</small><strong>{activeTasks}</strong></div>
              <span className="workflow-summary-note">na equipe</span>
            </div>
            <div className="workflow-summary-card">
              <span className="workflow-summary-icon amber"><CalendarDays size={17} /></span>
              <div><small>Com prazo vencido</small><strong>{overdueTasks}</strong></div>
              <span className="workflow-summary-note">precisam de atenção</span>
            </div>
            <div className="workflow-summary-card">
              <span className="workflow-summary-icon green"><CircleCheck size={17} /></span>
              <div><small>Concluídas</small><strong>{tasks.filter((task) => task.status === "DONE").length}</strong></div>
              <span className="workflow-summary-note">registradas</span>
            </div>
          </section>

          {showTaskForm && (
            <form className="workflow-form-panel" onSubmit={submitTask}>
              <div className="workflow-form-heading">
                <div><p className="card-kicker">EQUIPE</p><h2>{editingTaskId ? "Editar tarefa" : "Criar tarefa"}</h2></div>
                <button className="icon-action" type="button" onClick={() => setShowTaskForm(false)} aria-label="Fechar formulário"><X size={16} /></button>
              </div>
              <div className="workflow-form-grid">
                <label className="field">
                  <span>Tarefa</span>
                  <input autoFocus maxLength={120} required value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} placeholder="Ex.: Preparar relatório semanal" />
                </label>
                <label className="field">
                  <span>Responsável</span>
                  <AppSelect value={taskForm.assigneeId} onChange={(event) => setTaskForm({ ...taskForm, assigneeId: event.target.value })}>
                    <option value="">Sem responsável</option>
                    {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </AppSelect>
                </label>
                <label className="field">
                  <span>Prazo</span>
                  <input type="date" required value={taskForm.dueDate} onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })} />
                </label>
                <label className="field workflow-field-wide">
                  <span>Detalhes</span>
                  <input maxLength={500} value={taskForm.details} onChange={(event) => setTaskForm({ ...taskForm, details: event.target.value })} placeholder="Inclua contexto ou instruções para a pessoa" />
                </label>
              </div>
              {!team.length && <p className="workflow-form-help">Cadastre funcionários em <Link href="/equipe">Equipe e Agentes</Link> para atribuir tarefas a uma pessoa.</p>}
              <div className="workflow-form-actions">
                <button className="btn btn-ghost" type="button" onClick={() => setShowTaskForm(false)}>Cancelar</button>
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Salvando..." : editingTaskId ? "Salvar alterações" : "Criar tarefa"}</button>
              </div>
            </form>
          )}

          <div className="workflow-board-toolbar">
            <div><h2>Atividades da equipe</h2><p>Três etapas para acompanhar o andamento de cada pessoa.</p></div>
            <label className="workflow-filter">
              <Users size={15} aria-hidden="true" />
              <span className="sr-only">Filtrar tarefas por pessoa</span>
              <AppSelect value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
                <option value="all">Toda a equipe</option>
                {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </AppSelect>
            </label>
          </div>

          <div className="workflow-task-board">
            {TASK_COLUMNS.map((column) => {
              const columnTasks = visibleTasks.filter((task) => task.status === column.status);
              return (
                <section
                  className={`workflow-column workflow-column-${column.status.toLowerCase()}`}
                  key={column.status}
                  aria-label={`${column.label}: ${columnTasks.length} tarefas`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = dragId(event);
                    if (id) void moveTask(id, column.status);
                  }}
                >
                  <header className="workflow-column-heading">
                    <div><span className="workflow-status-dot" /><div><h3>{column.label}</h3><small>{column.hint}</small></div></div>
                    <span className="workflow-count">{columnTasks.length}</span>
                  </header>
                  <div className="workflow-card-list">
                    {columnTasks.map((task) => {
                      const owner = team.find((member) => member.id === task.assigneeId);
                      const overdue = task.status !== "DONE" && task.dueDate < today;
                      return (
                        <article
                          className={`workflow-card ${overdue ? "is-overdue" : ""}`}
                          key={task.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", task.id);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                        >
                          <div className="workflow-card-topline">
                            <span className="workflow-card-kind"><GripVertical size={13} aria-hidden="true" /> TAREFA</span>
                            <div className="workflow-card-actions">
                              <button className="icon-action" type="button" onClick={() => openTaskForm(task)} aria-label={`Editar tarefa ${task.title}`} title="Editar"><Pencil size={14} /></button>
                              <button className="icon-action danger" type="button" onClick={() => void removeCard("task", task.id, task.title)} aria-label={`Excluir tarefa ${task.title}`} title="Excluir"><Trash2 size={14} /></button>
                            </div>
                          </div>
                          <h4>{task.title}</h4>
                          {task.details && <p className="workflow-card-description">{task.details}</p>}
                          <div className="workflow-card-meta">
                            <span className={`workflow-due ${overdue ? "overdue" : ""}`}><CalendarDays size={13} />{formatDate(task.dueDate)}{overdue ? " · Atrasada" : ""}</span>
                            <span className="workflow-assignee">
                              <span className="workflow-avatar">{owner ? initials(owner.name) : "—"}</span>
                              {owner?.name ?? "Sem responsável"}
                            </span>
                          </div>
                          <label className="workflow-card-move">
                            <span>Mover para</span>
                            <AppSelect aria-label={`Mover tarefa ${task.title}`} value={task.status} onChange={(event) => void moveTask(task.id, event.target.value as TeamTaskStatus)}>
                              {TASK_COLUMNS.map((item) => <option key={item.status} value={item.status}>{item.label}</option>)}
                            </AppSelect>
                            {task.status === "DONE" && <Check size={13} aria-hidden="true" />}
                          </label>
                        </article>
                      );
                    })}
                    {!columnTasks.length && <div className="workflow-column-empty">Solte uma tarefa aqui ou crie uma nova.</div>}
                  </div>
                  <button className="workflow-add-card" type="button" onClick={() => openTaskForm(undefined, column.status)}><Plus size={15} /> Nova tarefa</button>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <section className="workflow-summary" aria-label="Resumo do pipeline comercial">
            <div className="workflow-summary-card">
              <span className="workflow-summary-icon blue"><BriefcaseBusiness size={17} /></span>
              <div><small>Negócios no pipeline</small><strong>{opportunities.length}</strong></div>
              <span className="workflow-summary-note">em todas as etapas</span>
            </div>
            <div className="workflow-summary-card">
              <span className="workflow-summary-icon violet"><ArrowDownRight size={17} /></span>
              <div><small>Valor total</small><strong>{brl(salesValue)}</strong></div>
              <span className="workflow-summary-note">valor informado</span>
            </div>
            <div className="workflow-summary-card">
              <span className="workflow-summary-icon green"><CircleCheck size={17} /></span>
              <div><small>Finalizados</small><strong>{opportunities.filter((opportunity) => stages.find((stage) => stage.id === opportunity.stageId)?.name.toLocaleLowerCase() === "finalizado").length}</strong></div>
              <span className="workflow-summary-note">nesta etapa</span>
            </div>
          </section>

          {(showOpportunityForm || showStageForm) && (
            <form className="workflow-form-panel" onSubmit={showStageForm ? submitStage : submitOpportunity}>
              <div className="workflow-form-heading">
                <div><p className="card-kicker">{showStageForm ? "ETAPA PERSONALIZADA" : "COMERCIAL"}</p><h2>{showStageForm ? "Adicionar etapa" : editingOpportunityId ? "Editar negócio" : "Adicionar negócio"}</h2></div>
                <button className="icon-action" type="button" onClick={() => { setShowOpportunityForm(false); setShowStageForm(false); }} aria-label="Fechar formulário"><X size={16} /></button>
              </div>
              {showStageForm ? (
                <div className="workflow-form-grid workflow-stage-form-grid">
                  <label className="field"><span>Nome da etapa</span><input autoFocus required maxLength={48} value={stageName} onChange={(event) => setStageName(event.target.value)} placeholder="Ex.: Em negociação" /></label>
                  <label className="field"><span>Cor</span><AppSelect value={stageTone} onChange={(event) => setStageTone(event.target.value as PipelineTone)}>{STAGE_TONES.map((tone) => <option key={tone.value} value={tone.value}>{tone.label}</option>)}</AppSelect></label>
                </div>
              ) : (
                <div className="workflow-form-grid">
                  <label className="field"><span>Nome do negócio</span><input autoFocus required maxLength={120} value={opportunityForm.title} onChange={(event) => setOpportunityForm({ ...opportunityForm, title: event.target.value })} placeholder="Ex.: Plano de mídia trimestral" /></label>
                  <label className="field"><span>Empresa ou cliente</span><input maxLength={120} value={opportunityForm.company} onChange={(event) => setOpportunityForm({ ...opportunityForm, company: event.target.value })} placeholder="Nome da empresa" /></label>
                  <label className="field"><span>Pessoa de contato</span><input maxLength={120} value={opportunityForm.contact} onChange={(event) => setOpportunityForm({ ...opportunityForm, contact: event.target.value })} placeholder="Nome do contato" /></label>
                  <label className="field"><span>Valor estimado (R$)</span><input type="number" min="0" step="0.01" value={opportunityForm.amount} onChange={(event) => setOpportunityForm({ ...opportunityForm, amount: event.target.value })} placeholder="0,00" /></label>
                  <label className="field"><span>Responsável</span><AppSelect value={opportunityForm.ownerId} onChange={(event) => setOpportunityForm({ ...opportunityForm, ownerId: event.target.value })}><option value="">Sem responsável</option>{team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</AppSelect></label>
                  <label className="field"><span>Etapa</span><AppSelect required value={opportunityForm.stageId} onChange={(event) => setOpportunityForm({ ...opportunityForm, stageId: event.target.value })}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</AppSelect></label>
                  <label className="field"><span>Próxima ação</span><input maxLength={240} value={opportunityForm.nextStep} onChange={(event) => setOpportunityForm({ ...opportunityForm, nextStep: event.target.value })} placeholder="Ex.: Agendar uma conversa" /></label>
                  <label className="field"><span>Prazo da próxima ação</span><input type="date" value={opportunityForm.dueDate} onChange={(event) => setOpportunityForm({ ...opportunityForm, dueDate: event.target.value })} /></label>
                </div>
              )}
              <div className="workflow-form-actions">
                <button className="btn btn-ghost" type="button" onClick={() => { setShowOpportunityForm(false); setShowStageForm(false); }}>Cancelar</button>
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Salvando..." : showStageForm ? "Adicionar etapa" : editingOpportunityId ? "Salvar alterações" : "Criar negócio"}</button>
              </div>
            </form>
          )}

          <div className="workflow-board-toolbar">
            <div><h2>Negócios por etapa</h2><p>Personalize as etapas para acompanhar o processo da sua empresa.</p></div>
            <button className="btn btn-ghost workflow-stage-add" onClick={() => { setShowOpportunityForm(false); setShowStageForm((open) => !open); }}>
              {showStageForm ? <X size={15} /> : <Plus size={15} />}{showStageForm ? "Fechar etapa" : "Adicionar etapa"}
            </button>
          </div>

          {!stages.length && !loading ? (
            <div className="workflow-empty-state"><BriefcaseBusiness size={24} /><h3>Comece seu pipeline</h3><p>Adicione uma etapa e organize os negócios da sua empresa.</p><button className="btn btn-primary" onClick={() => setShowStageForm(true)}><Plus size={15} /> Adicionar etapa</button></div>
          ) : (
            <div className="workflow-sales-board">
              {stages.map((stage) => {
                const stageOpportunities = opportunities.filter((opportunity) => opportunity.stageId === stage.id);
                const stageValue = stageOpportunities.reduce((total, opportunity) => total + opportunity.amount, 0);
                return (
                  <section
                    className={`workflow-sales-column tone-${stage.tone}`}
                    key={stage.id}
                    aria-label={`${stage.name}: ${stageOpportunities.length} negócios`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const id = dragId(event);
                      if (id) void moveOpportunity(id, stage.id);
                    }}
                  >
                    <header className="workflow-sales-column-heading">
                      <div><span className="workflow-stage-indicator" /><div><h3>{stage.name}</h3><small>{stageOpportunities.length} {stageOpportunities.length === 1 ? "negócio" : "negócios"}</small></div></div>
                      <div className="workflow-stage-actions">
                        <span className="workflow-stage-total">{brl(stageValue)}</span>
                        {stages.length > 1 && <button className="icon-action danger" type="button" onClick={() => void removeStage(stage)} title={`Remover etapa ${stage.name}`} aria-label={`Remover etapa ${stage.name}`}><Trash2 size={14} /></button>}
                      </div>
                    </header>
                    <div className="workflow-card-list">
                      {stageOpportunities.map((opportunity) => {
                        const owner = team.find((member) => member.id === opportunity.ownerId);
                        return (
                          <article
                            className="workflow-card workflow-opportunity-card"
                            key={opportunity.id}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/plain", opportunity.id);
                              event.dataTransfer.effectAllowed = "move";
                            }}
                          >
                            <div className="workflow-card-topline">
                              <span className="workflow-card-kind"><GripVertical size={13} aria-hidden="true" /> NEGÓCIO</span>
                              <div className="workflow-card-actions">
                                <button className="icon-action" type="button" onClick={() => openOpportunityForm(opportunity)} aria-label={`Editar negócio ${opportunity.title}`} title="Editar"><Pencil size={14} /></button>
                                <button className="icon-action danger" type="button" onClick={() => void removeCard("opportunity", opportunity.id, opportunity.title)} aria-label={`Excluir negócio ${opportunity.title}`} title="Excluir"><Trash2 size={14} /></button>
                              </div>
                            </div>
                            <h4>{opportunity.title}</h4>
                            {opportunity.company && <p className="workflow-opportunity-company">{opportunity.company}</p>}
                            {opportunity.contact && <p className="workflow-card-contact">Contato · {opportunity.contact}</p>}
                            <div className="workflow-opportunity-value">{opportunity.amount ? brl(opportunity.amount) : "Valor não informado"}</div>
                            {opportunity.nextStep && <div className="workflow-next-step"><ArrowRight size={13} /><span>{opportunity.nextStep}</span></div>}
                            <div className="workflow-card-meta">
                              <span className="workflow-assignee"><span className="workflow-avatar">{owner ? initials(owner.name) : "—"}</span>{owner?.name ?? "Sem responsável"}</span>
                              {opportunity.dueDate && <span className="workflow-due"><CalendarDays size={13} />{formatDate(opportunity.dueDate)}</span>}
                            </div>
                            <label className="workflow-card-move">
                              <span>Mover para</span>
                              <AppSelect aria-label={`Mover negócio ${opportunity.title}`} value={stage.id} onChange={(event) => void moveOpportunity(opportunity.id, event.target.value)}>
                                {stages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                              </AppSelect>
                            </label>
                          </article>
                        );
                      })}
                      {!stageOpportunities.length && <div className="workflow-column-empty">Nenhum negócio nesta etapa.</div>}
                    </div>
                    <button className="workflow-add-card" type="button" onClick={() => { openOpportunityForm(); setOpportunityForm((current) => ({ ...current, stageId: stage.id })); }}><Plus size={15} /> Adicionar negócio</button>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(" de ", " ");
}
