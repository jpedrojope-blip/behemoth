"use client";

import { useEffect, useState } from "react";
import { Bot, Plus, Trash2, User, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useResource } from "@/lib/client";
import { brl } from "@/lib/format";
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

type Payload = { team: TeamMember[]; summary: Summary };

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

export default function EquipePage() {
  const { data, loading, error } = useResource<Payload>("/api/team");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"todos" | "HUMAN" | "AI">("todos");
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

  const team = (data?.team ?? []).filter((member) => filter === "todos" || member.type === filter);
  const summary = data?.summary;

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <p className="eyebrow">EQUIPE & AGENTES</p>
          <h1 className="page-title">Trabalho humano e digital</h1>
          <p className="subtitle">Custo, desempenho, metas e retorno de cada integrante — pessoas e agentes de IA.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setFormOpen((open) => !open)}>
          {formOpen ? <X size={16} /> : <Plus size={16} />} {formOpen ? "Cancelar" : "Adicionar"}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <section className="section stat-grid">
        <div className="stat">
          <span>Time total</span>
          <strong>{summary?.total ?? 0}</strong>
          <small>
            {summary?.humans ?? 0} pessoas · {summary?.agents ?? 0} agentes
          </small>
        </div>
        <div className="stat">
          <span>Custo mensal</span>
          <strong>{brl(summary?.monthlyCost ?? 0)}</strong>
          <small>
            Pessoas {brl(summary?.humanCost ?? 0)} · Agentes {brl(summary?.agentCost ?? 0)}
          </small>
        </div>
        <div className="stat">
          <span>Desempenho médio</span>
          <strong>{summary?.averagePerformance ?? 0}%</strong>
          <small>{summary?.onTarget ?? 0} dentro da meta</small>
        </div>
        <div className="stat">
          <span>ROI médio</span>
          <strong>{summary?.averageRoi ?? 0}%</strong>
          <small>retorno estimado sobre o custo</small>
        </div>
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
              <input id="generatedValue" type="number" min="0" value={form.generatedValue} onChange={(event) => setForm({ ...form, generatedValue: event.target.value })} placeholder="12500" />
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

      <section className="section card">
        <div className="section-head">
          <h2>Integrantes</h2>
          <select className="btn btn-ghost" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="todos">Todos</option>
            <option value="HUMAN">Pessoas</option>
            <option value="AI">Agentes de IA</option>
          </select>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>INTEGRANTE</th>
                <th>DESEMPENHO / META</th>
                <th className="num">CUSTO MENSAL</th>
                <th className="num">ROI</th>
                <th className="num">GERADO</th>
                <th>STATUS</th>
                <th className="actions">AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {team.map((member) => {
                const onTarget = member.performance >= member.target;
                return (
                  <tr key={member.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="quick-icon" style={member.type === "AI" ? { background: "#f0ecff", color: "#7654e7" } : undefined}>
                          {member.type === "AI" ? <Bot size={17} /> : <User size={17} />}
                        </div>
                        <div>
                          <strong>{member.name}</strong>
                          <div className="small muted">{member.role}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className={`bar ${onTarget ? "green" : "amber"}`}>
                          <span style={{ width: `${member.performance}%` }} />
                        </div>
                        <span className="small">
                          {member.performance}% / {member.target}%
                        </span>
                      </div>
                    </td>
                    <td className="num">{brl(member.monthlyCost)}</td>
                    <td className="num">{member.roi}%</td>
                    <td className="num">{brl(member.generatedValue ?? 0)}</td>
                    <td>
                      <button
                        className={`pill ${member.status === "ACTIVE" ? "green" : "amber"}`}
                        onClick={() => patch(member, { status: member.status === "ACTIVE" ? "REVIEW" : "ACTIVE" })}
                        title="Alternar status"
                      >
                        {member.status === "ACTIVE" ? "Ativo" : "Em revisão"}
                      </button>
                    </td>
                    <td className="actions">
                      <button className="icon-action danger" onClick={() => remove(member)} title="Remover">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && !team.length && <p className="empty" style={{ marginTop: 16 }}>Nenhum integrante cadastrado.</p>}
      </section>
    </div>
  );
}
