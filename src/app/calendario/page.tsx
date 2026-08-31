"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Trash2, X, Zap } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useResource } from "@/lib/client";
import { brl, shortDate } from "@/lib/format";
import type { CalendarEvent } from "@/lib/types";

type Payload = {
  events: CalendarEvent[];
  today: string;
  people: string[];
  summary: { total: number; pending: number; today: number; late: number; automated: number };
};

const KIND_LABELS: Record<CalendarEvent["kind"], string> = {
  MEETING: "Reunião",
  TASK: "Tarefa",
  PAYMENT: "Pagamento",
  EVENT: "Evento",
};

const KIND_TONES: Record<CalendarEvent["kind"], string> = {
  MEETING: "blue",
  TASK: "purple",
  PAYMENT: "amber",
  EVENT: "gray",
};

const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function CalendarioPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const notify = useToast();

  const month = monthKey(cursor);
  const { data, loading, error } = useResource<Payload>(`/api/events?month=${month}`);

  const [form, setForm] = useState({
    title: "",
    date: selectedDay,
    time: "09:00",
    durationMinutes: "30",
    kind: "MEETING" as CalendarEvent["kind"],
    owner: "",
    amount: "",
  });

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const list: (string | null)[] = Array.from({ length: offset }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      list.push(`${month}-${String(day).padStart(2, "0")}`);
    }
    return list;
  }, [cursor, month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of data?.events ?? []) {
      map.set(event.date, [...(map.get(event.date) ?? []), event]);
    }
    return map;
  }, [data]);

  const dayEvents = eventsByDay.get(selectedDay) ?? [];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/api/events", { method: "POST", body: JSON.stringify(form) });
      notify("Compromisso agendado.", "success");
      setForm({ ...form, title: "" });
      setFormOpen(false);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao agendar.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(event: CalendarEvent) {
    try {
      await apiFetch(`/api/events/${event.id}`, { method: "PATCH", body: JSON.stringify({ done: !event.done }) });
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao atualizar.", "error");
    }
  }

  async function remove(event: CalendarEvent) {
    if (!window.confirm(`Excluir "${event.title}"?`)) return;
    try {
      await apiFetch(`/api/events/${event.id}`, { method: "DELETE" });
      notify("Compromisso excluído.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao excluir.", "error");
    }
  }

  function shiftMonth(delta: number) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <p className="eyebrow">CALENDÁRIO</p>
          <h1 className="page-title">Agenda operacional</h1>
          <p className="subtitle">
            {data?.summary.today ?? 0} compromisso(s) hoje · {data?.summary.pending ?? 0} em aberto neste mês
          {(data?.summary.late ?? 0) > 0 ? ` · ${data?.summary.late} atrasado(s)` : ""}.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setForm({ ...form, date: selectedDay });
            setFormOpen((open) => !open);
          }}
        >
          {formOpen ? <X size={16} /> : <Plus size={16} />} {formOpen ? "Cancelar" : "Novo compromisso"}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {formOpen && (
        <form className="inline-form section" onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="title">Título</label>
              <input
                id="title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Daily com equipe"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="date">Data</label>
              <input
                id="date"
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="time">Hora</label>
              <input
                id="time"
                type="time"
                value={form.time}
                onChange={(event) => setForm({ ...form, time: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="duration">Duração (min)</label>
              <input
                id="duration"
                type="number"
                min="5"
                step="5"
                value={form.durationMinutes}
                onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="kind">Tipo</label>
              <select
                id="kind"
                value={form.kind}
                onChange={(event) => setForm({ ...form, kind: event.target.value as CalendarEvent["kind"] })}
              >
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="owner">Responsável</label>
              <select
                id="owner"
                value={form.owner}
                onChange={(event) => setForm({ ...form, owner: event.target.value })}
              >
                <option value="">Eu</option>
                {(data?.people ?? []).map((person) => (
                  <option key={person} value={person}>
                    {person}
                  </option>
                ))}
              </select>
            </div>
            {form.kind === "PAYMENT" && (
              <div className="field">
                <label htmlFor="amount">Valor (R$)</label>
                <input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  placeholder="Vira despesa ao concluir"
                />
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Agendar"}
            </button>
          </div>
        </form>
      )}

      <section className="section split">
        <div className="card calendar-main-card">
          <div className="section-head">
            <h2>{cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="icon-action" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
                <ChevronLeft size={16} />
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setCursor(new Date())}>
                Hoje
              </button>
              <button className="icon-action" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="calendar-grid">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="calendar-weekday">
                {weekday}
              </div>
            ))}
            {cells.map((day, index) => {
              if (!day) return <div key={`empty-${index}`} className="calendar-cell empty-cell" />;
              const events = eventsByDay.get(day) ?? [];
              const isToday = day === data?.today;
              const isSelected = day === selectedDay;
              return (
                <button
                  key={day}
                  className={`calendar-cell ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedDay(day)}
                >
                  <span className="calendar-day">{Number(day.slice(8))}</span>
                  <span className="calendar-dots">
                    {events.slice(0, 2).map((event) => (
                      <span
                        key={event.id}
                        className={`calendar-chip ${KIND_TONES[event.kind]}`}
                        style={event.done ? { opacity: 0.55, textDecoration: "line-through" } : undefined}
                        title={`${event.time} · ${event.title}`}
                      >
                        {event.time} {event.title}
                      </span>
                    ))}
                    {events.length > 2 && <span className="calendar-more">+{events.length - 2}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card day-agenda-card">
          <div className="card-head">
            <div>
              <p className="card-kicker">{shortDate(selectedDay)}</p>
              <h2>Compromissos do dia</h2>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            {dayEvents
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((event) => (
                <div className="list-item" key={event.id}>
                  <button
                    className={`check ${event.done ? "done" : ""}`}
                    onClick={() => toggle(event)}
                    title={event.done ? "Reabrir" : "Concluir"}
                  >
                    {event.done && <Check size={13} />}
                  </button>
                  <div className="grow">
                    <strong style={event.done ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>
                      {event.time} · {event.title}
                    </strong>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {event.owner} · {event.durationMinutes} min
                      {typeof event.amount === "number" && event.amount > 0 && ` · ${brl(event.amount)}`}
                      {event.auto && (
                        <span className="pill purple" title="Criado por automação">
                          <Zap size={10} /> auto
                        </span>
                      )}
                    </span>
                  </div>
                  <span className={`pill ${KIND_TONES[event.kind]}`}>{KIND_LABELS[event.kind]}</span>
                  <button className="icon-action danger" onClick={() => remove(event)} title="Excluir">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            {!dayEvents.length && !loading && <p className="empty">Nenhum compromisso neste dia.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
