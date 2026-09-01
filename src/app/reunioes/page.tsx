"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useResource } from "@/lib/client";
import { shortDate } from "@/lib/format";
import type { ActionItem, Meeting } from "@/lib/types";

type Payload = { meetings: Meeting[]; openActionItems: number; people: string[] };

export default function ReunioesPage() {
  const { data, loading, error } = useResource<Payload>("/api/meetings");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ notes: string; transcript: string }>({ notes: "", transcript: "" });
  const [newMeeting, setNewMeeting] = useState({ title: "", date: new Date().toISOString().slice(0, 16) });
  const [formOpen, setFormOpen] = useState(false);
  const [newAction, setNewAction] = useState({ title: "", owner: "", due: "" });
  const [busy, setBusy] = useState(false);
  const notify = useToast();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("novo")) setFormOpen(true);
  }, []);

  const meetings = useMemo(() => data?.meetings ?? [], [data]);
  const selected = meetings.find((meeting) => meeting.id === selectedId) ?? meetings[0] ?? null;

  useEffect(() => {
    if (selected) setDraft({ notes: selected.notes, transcript: selected.transcript });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createMeeting(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await apiFetch<{ meeting: Meeting }>("/api/meetings", {
        method: "POST",
        body: JSON.stringify({ title: newMeeting.title, date: new Date(newMeeting.date).toISOString() }),
      });
      notify("Reunião criada.", "success");
      setNewMeeting({ title: "", date: new Date().toISOString().slice(0, 16) });
      setFormOpen(false);
      setSelectedId(result.meeting.id);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao criar.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/api/meetings/${selected.id}`, { method: "PATCH", body: JSON.stringify(draft) });
      notify("Notas salvas.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao salvar.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function generateSummary() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/api/meetings/${selected.id}`, { method: "PATCH", body: JSON.stringify(draft) });
      const result = await apiFetch<{ suggestedActionItems: { title: string }[] }>(
        `/api/meetings/${selected.id}/summary`,
        { method: "POST" },
      );
      notify(`Resumo gerado a partir de ${result.suggestedActionItems.length} trecho(s) relevantes.`, "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao gerar resumo.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveActionItems(items: ActionItem[]) {
    if (!selected) return;
    try {
      await apiFetch(`/api/meetings/${selected.id}`, { method: "PATCH", body: JSON.stringify({ actionItems: items }) });
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao atualizar.", "error");
    }
  }

  async function addActionItem(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !newAction.title.trim()) return;
    await saveActionItems([
      ...selected.actionItems,
      { id: "", title: newAction.title.trim(), owner: newAction.owner, due: newAction.due, done: false },
    ]);
    setNewAction({ title: "", owner: "", due: "" });
  }

  async function removeMeeting(meeting: Meeting) {
    if (!window.confirm(`Excluir a reunião "${meeting.title}"?`)) return;
    try {
      await apiFetch(`/api/meetings/${meeting.id}`, { method: "DELETE" });
      setSelectedId(null);
      notify("Reunião excluída.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao excluir.", "error");
    }
  }

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <h1 className="page-title">Sala de Reunião Inteligente</h1>
          <p className="subtitle">
            Registre decisões e deixe o resumo e os itens de ação organizados automaticamente.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setFormOpen((open) => !open)}>
          {formOpen ? <X size={16} /> : <Plus size={16} />} {formOpen ? "Cancelar" : "Nova reunião"}
        </button>
      </div>

      <section className="hero">
        <div>
          <p className="card-kicker">REUNIÃO EM UM CLIQUE</p>
          <h2>Anote, gere o resumo e distribua os responsáveis</h2>
          <p>
            O resumo é extraído das suas notas e da transcrição sem sair da máquina — nenhum dado é enviado para fora.
            Cada item de ação com prazo vira uma tarefa no calendário automaticamente.
          </p>
          <button className="btn" onClick={() => setFormOpen(true)}>
            <Plus size={16} /> Abrir nova reunião
          </button>
          <p className="small" style={{ margin: "14px 0 0", color: "#bfd4ff" }}>
            {data?.openActionItems ?? 0} item(ns) de ação em aberto · Google Meet entra aqui quando o OAuth for
            configurado
          </p>
        </div>
        <div className="hero-art">
          <Sparkles size={38} />
        </div>
      </section>

      {error && <p className="form-error" style={{ marginTop: 16 }}>{error}</p>}

      {formOpen && (
        <form className="inline-form section" onSubmit={createMeeting}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="title">Título</label>
              <input
                id="title"
                value={newMeeting.title}
                onChange={(event) => setNewMeeting({ ...newMeeting, title: event.target.value })}
                placeholder="Resultados da campanha"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="date">Data e hora</label>
              <input
                id="date"
                type="datetime-local"
                value={newMeeting.date}
                onChange={(event) => setNewMeeting({ ...newMeeting, date: event.target.value })}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Criar reunião
            </button>
          </div>
        </form>
      )}

      <section className="section split">
        <div className="card">
          {!selected && !loading && <p className="empty">Crie a primeira reunião para começar.</p>}
          {selected && (
            <>
              <div className="card-head">
                <div>
                  <p className="card-kicker">
                    {new Date(selected.date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                  <h2>{selected.title}</h2>
                </div>
                <button className="icon-action danger" onClick={() => removeMeeting(selected)} title="Excluir reunião">
                  <Trash2 size={15} />
                </button>
              </div>

              {selected.summary && (
                <div className="insight-body" style={{ marginTop: 20 }}>
                  <div className="insight-icon">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <strong>Resumo</strong>
                    <p>{selected.summary}</p>
                  </div>
                </div>
              )}

              <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 20 }}>
                <div className="field">
                  <label htmlFor="notes">Notas da reunião</label>
                  <textarea
                    id="notes"
                    value={draft.notes}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                    placeholder="Decisões, contexto e próximos passos..."
                  />
                </div>
                <div className="field">
                  <label htmlFor="transcript">Transcrição</label>
                  <textarea
                    id="transcript"
                    value={draft.transcript}
                    onChange={(event) => setDraft({ ...draft, transcript: event.target.value })}
                    placeholder="Cole aqui a transcrição da conversa..."
                  />
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn btn-ghost" onClick={saveDraft} disabled={busy} type="button">
                    <Save size={15} /> Salvar notas
                  </button>
                  <button className="btn btn-primary" onClick={generateSummary} disabled={busy} type="button">
                    <Sparkles size={15} /> Gerar resumo
                  </button>
                </div>
              </div>

              <div className="section-head" style={{ marginTop: 28 }}>
                <h2>Itens de ação</h2>
                <span className="small muted">
                  {selected.actionItems.filter((item) => !item.done).length} em aberto
                </span>
              </div>

              {selected.actionItems.map((item) => (
                <div className="list-item" key={item.id}>
                  <button
                    className={`check ${item.done ? "done" : ""}`}
                    onClick={() =>
                      saveActionItems(
                        selected.actionItems.map((entry) =>
                          entry.id === item.id ? { ...entry, done: !entry.done } : entry,
                        ),
                      )
                    }
                    title={item.done ? "Reabrir" : "Concluir"}
                  >
                    {item.done && <Check size={13} />}
                  </button>
                  <div className="grow">
                    <strong style={item.done ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>
                      {item.title}
                    </strong>
                    <span>
                      {item.owner || "sem responsável"}
                      {item.due ? ` · até ${shortDate(item.due)}` : ""}
                    </span>
                  </div>
                  <button
                    className="icon-action danger"
                    onClick={() => saveActionItems(selected.actionItems.filter((entry) => entry.id !== item.id))}
                    title="Remover"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              <form className="form-grid" style={{ marginTop: 18 }} onSubmit={addActionItem}>
                <div className="field">
                  <label htmlFor="action">Novo item</label>
                  <input
                    id="action"
                    value={newAction.title}
                    onChange={(event) => setNewAction({ ...newAction, title: event.target.value })}
                    placeholder="Atualizar apresentação comercial"
                  />
                </div>
                <div className="field">
                  <label htmlFor="owner">Responsável</label>
                  <select
                    id="owner"
                    value={newAction.owner}
                    onChange={(event) => setNewAction({ ...newAction, owner: event.target.value })}
                  >
                    <option value="">Selecione</option>
                    {(data?.people ?? []).map((person) => (
                      <option key={person} value={person}>
                        {person}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="due">Prazo</label>
                  <input
                    id="due"
                    type="date"
                    value={newAction.due}
                    onChange={(event) => setNewAction({ ...newAction, due: event.target.value })}
                  />
                </div>
                <button className="btn btn-ghost" type="submit">
                  <Plus size={15} /> Adicionar
                </button>
              </form>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <p className="card-kicker">HISTÓRICO COMPLETO</p>
              <h2>Reuniões anteriores</h2>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            {meetings.map((meeting) => {
              const open = meeting.actionItems.filter((item) => !item.done).length;
              return (
                <button
                  key={meeting.id}
                  className="list-item"
                  style={{ width: "100%", textAlign: "left" }}
                  onClick={() => setSelectedId(meeting.id)}
                >
                  <div className="grow">
                    <strong style={{ color: meeting.id === selected?.id ? "var(--blue)" : undefined }}>
                      {meeting.title}
                    </strong>
                    <span>{new Date(meeting.date).toLocaleDateString("pt-BR", { dateStyle: "short" })}</span>
                  </div>
                  {!!open && <b className="nav-badge">{open}</b>}
                </button>
              );
            })}
            {!meetings.length && !loading && <p className="empty">Nenhuma reunião registrada.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
