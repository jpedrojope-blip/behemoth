"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Bot, Save, UserRound } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useResource } from "@/lib/client";
import { brl, initials } from "@/lib/format";
import type { TeamMember } from "@/lib/types";

type EditForm = {
  name: string;
  role: string;
  type: TeamMember["type"];
  performance: string;
  target: string;
  monthlyCost: string;
  generatedValue: string;
  roi: string;
  status: TeamMember["status"];
};

export default function TeamMemberPage() {
  const { id } = useParams<{ id: string }>();
  const { data: member, loading, error } = useResource<TeamMember>(`/api/team/${encodeURIComponent(id)}`);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const notify = useToast();

  function beginEditing() {
    if (!member) return;
    setForm({
      name: member.name,
      role: member.role,
      type: member.type,
      performance: String(member.performance),
      target: String(member.target),
      monthlyCost: String(member.monthlyCost),
      generatedValue: String(member.generatedValue),
      roi: String(member.roi),
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
          performance: Number(form.performance),
          target: Number(form.target),
          monthlyCost: Number(form.monthlyCost),
          generatedValue: Number(form.generatedValue),
          roi: Number(form.roi),
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
          {!editing && <button className="btn btn-primary" onClick={beginEditing}>Editar perfil</button>}
        </div>
      </header>

      <section className="team-profile-metrics" aria-label="Resumo do integrante">
        <article className="card team-profile-metric">
          <span>Desempenho</span>
          <strong>{member.performance}%</strong>
        </article>
        <article className="card team-profile-metric">
          <span>Meta</span>
          <strong>{member.target}%</strong>
        </article>
        <article className="card team-profile-metric">
          <span>Custo mensal</span>
          <strong>{brl(member.monthlyCost)}</strong>
        </article>
        <article className="card team-profile-metric">
          <span>Valor gerado</span>
          <strong>{brl(member.generatedValue)}</strong>
        </article>
        <article className="card team-profile-metric">
          <span>ROI</span>
          <strong>{member.roi}%</strong>
        </article>
      </section>

      {editing && form && (
        <form className="card team-profile-edit" onSubmit={submit}>
          <div className="card-head">
            <div>
              <p className="card-kicker">DADOS SALVOS</p>
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
              <label htmlFor="profile-type">Tipo</label>
              <select id="profile-type" value={form.type} onChange={(event) => updateForm("type", event.target.value as TeamMember["type"])}>
                <option value="HUMAN">Pessoa</option>
                <option value="AI">Agente de IA</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="profile-status">Situação</label>
              <select id="profile-status" value={form.status} onChange={(event) => updateForm("status", event.target.value as TeamMember["status"])}>
                <option value="ACTIVE">Ativo</option>
                <option value="REVIEW">Em revisão</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="profile-performance">Desempenho (%)</label>
              <input id="profile-performance" type="number" min="0" max="100" value={form.performance} onChange={(event) => updateForm("performance", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="profile-target">Meta (%)</label>
              <input id="profile-target" type="number" min="0" max="100" value={form.target} onChange={(event) => updateForm("target", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="profile-cost">Custo mensal (R$)</label>
              <input id="profile-cost" type="number" min="0" value={form.monthlyCost} onChange={(event) => updateForm("monthlyCost", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="profile-value">Valor gerado (R$)</label>
              <input id="profile-value" type="number" min="0" value={form.generatedValue} onChange={(event) => updateForm("generatedValue", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="profile-roi">ROI (%)</label>
              <input id="profile-roi" type="number" min="0" value={form.roi} onChange={(event) => updateForm("roi", event.target.value)} />
            </div>
          </div>
        </form>
      )}

      {!editing && (
        <section className="card team-profile-details">
          <div className="card-head">
            <div>
              <p className="card-kicker">INFORMAÇÕES DO CADASTRO</p>
              <h2>Dados de {isAgent ? "operação" : "contratação"}</h2>
            </div>
            <div className="team-profile-type">
              {isAgent ? <Bot size={17} /> : <UserRound size={17} />}
              {isAgent ? "Agente de IA" : "Funcionário"}
            </div>
          </div>
          <dl className="team-profile-data-list">
            <div><dt>Nome</dt><dd>{member.name}</dd></div>
            <div><dt>Função</dt><dd>{member.role}</dd></div>
            <div><dt>Situação</dt><dd>{member.status === "ACTIVE" ? "Ativo" : "Em revisão"}</dd></div>
            <div><dt>Meta de desempenho</dt><dd>{member.target}%</dd></div>
            <div><dt>Valor atribuído no período</dt><dd>{brl(member.generatedValue)}</dd></div>
            <div><dt>Retorno sobre o custo</dt><dd>{member.roi}%</dd></div>
          </dl>
        </section>
      )}
    </div>
  );
}
