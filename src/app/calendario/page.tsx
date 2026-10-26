"use client";

import { useMemo, useState } from "react";
import { AppSelect } from "@/components/ui/app-select";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Filter, Plus, Trash2, X, Zap } from "lucide-react";
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
  EVENT: "green",
};

const MINI_WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const SHORT_WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type CalendarDay = { date: string; day: number; inMonth: boolean };

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function CalendarioPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()));
  const [kindFilter, setKindFilter] = useState<"ALL" | CalendarEvent["kind"]>("ALL");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const notify = useToast();

  const month = monthKey(cursor);

  const [form, setForm] = useState({
    title: "",
    date: selectedDay,
    time: "09:00",
    durationMinutes: "30",
    kind: "MEETING" as CalendarEvent["kind"],
    owner: "",
    amount: "",
  });

  const cells = useMemo<CalendarDay[]>(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const offset = first.getDay();
    const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
    return Array.from({ length: cellCount }, (_, index) => {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), index - offset + 1);
      return { date: dateKey(date), day: date.getDate(), inMonth: date.getMonth() === cursor.getMonth() };
    });
  }, [cursor]);

  const weekDays = useMemo<CalendarDay[]>(() => {
    const [year, monthNumber, dayNumber] = selectedDay.split("-").map(Number);
    const selected = new Date(year, monthNumber - 1, dayNumber);
    const weekStart = new Date(year, monthNumber - 1, dayNumber - selected.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index);
      return { date: dateKey(date), day: date.getDate(), inMonth: date.getMonth() === cursor.getMonth() };
    });
  }, [cursor, selectedDay]);

  const weekRange = useMemo(() => {
    const first = weekDays[0]?.date ?? selectedDay;
    const last = weekDays[6]?.date ?? selectedDay;
    const firstDate = new Date(`${first}T12:00:00`);
    const lastDate = new Date(`${last}T12:00:00`);
    const firstMonth = firstDate.toLocaleDateString("pt-BR", { month: "long" });
    const lastMonth = lastDate.toLocaleDateString("pt-BR", { month: "long" });
    const year = lastDate.getFullYear();
    const label = firstDate.getMonth() === lastDate.getMonth()
      ? `${firstDate.getDate()}–${lastDate.getDate()} de ${lastMonth} de ${year}`
      : `${firstDate.getDate()} de ${firstMonth} – ${lastDate.getDate()} de ${lastMonth} de ${year}`;
    return { first, last, label };
  }, [selectedDay, weekDays]);

  const monthGridStart = cells[0]?.date ?? `${month}-01`;
  const monthGridEnd = cells[cells.length - 1]?.date ?? `${month}-28`;
  const rangeStart = weekRange.first < monthGridStart ? weekRange.first : monthGridStart;
  const rangeEnd = weekRange.last > monthGridEnd ? weekRange.last : monthGridEnd;
  const { data, loading, error } = useResource<Payload>(`/api/events?month=${month}&start=${rangeStart}&end=${rangeEnd}`);

  const monthOptions = useMemo(
    () => Array.from({ length: 25 }, (_, index) => new Date(cursor.getFullYear(), cursor.getMonth() + index - 12, 1)),
    [cursor],
  );

  const visibleEvents = useMemo(
    () => (data?.events ?? []).filter((event) => kindFilter === "ALL" || event.kind === kindFilter),
    [data, kindFilter],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of visibleEvents) {
      map.set(event.date, [...(map.get(event.date) ?? []), event]);
    }
    return map;
  }, [visibleEvents]);

  const dayEvents = [...(eventsByDay.get(selectedDay) ?? [])].sort((a, b) => a.time.localeCompare(b.time));

  function selectDay(day: string) {
    setSelectedDay(day);
    const [year, monthNumber] = day.split("-").map(Number);
    if (`${year}-${String(monthNumber).padStart(2, "0")}` !== month) {
      setCursor(new Date(year, monthNumber - 1, 1));
    }
  }

  function shiftWeek(delta: number) {
    const [year, monthNumber, dayNumber] = selectedDay.split("-").map(Number);
    const next = new Date(year, monthNumber - 1, dayNumber + delta * 7);
    setSelectedDay(dateKey(next));
    setCursor(new Date(next.getFullYear(), next.getMonth(), 1));
  }

  function openFormForDay(day: string) {
    selectDay(day);
    setForm((current) => ({ ...current, date: day }));
    setFormOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/api/events", { method: "POST", body: JSON.stringify(form) });
      notify("Compromisso agendado.", "success");
      selectDay(form.date);
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
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    const selectedDayNumber = Number(selectedDay.slice(8, 10));
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    const nextDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(selectedDayNumber, lastDay));
    setCursor(nextMonth);
    setSelectedDay(dateKey(nextDay));
  }

  function chooseMonth(value: string) {
    const [year, monthNumber] = value.split("-").map(Number);
    const nextMonth = new Date(year, monthNumber - 1, 1);
    const selectedDayNumber = Number(selectedDay.slice(8, 10));
    const lastDay = new Date(year, monthNumber, 0).getDate();
    const nextDay = new Date(year, monthNumber - 1, Math.min(selectedDayNumber, lastDay));
    setCursor(nextMonth);
    setSelectedDay(dateKey(nextDay));
  }

  function goToToday() {
    const today = new Date();
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    selectDay(dateKey(today));
  }

  return (
    <div className="page-wrap calendar-page">
      <div className="page-head calendar-page-head">
        <div>
          <p className="eyebrow">CALENDÁRIO</p>
          <h1 className="page-title">Calendário</h1>
          <p className="subtitle">Gerencie sua agenda, compromissos e vencimentos.</p>
          <p className="subtitle">
            {data?.summary.today ?? 0} compromisso(s) hoje · {data?.summary.pending ?? 0} em aberto neste mês
          {(data?.summary.late ?? 0) > 0 ? ` · ${data?.summary.late} atrasado(s)` : ""}.
          </p>
        </div>
        <div className="calendar-page-actions">
          <label className="calendar-control">
            <Filter size={15} aria-hidden="true" />
            <AppSelect aria-label="Filtrar compromissos por tipo" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}>
              <option value="ALL">Todos os tipos</option>
              {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </AppSelect>
          </label>
          <label className="calendar-control calendar-month-select">
            <CalendarDays size={15} aria-hidden="true" />
            <AppSelect
              aria-label="Escolher mês"
              value={month}
              onChange={(event) => chooseMonth(event.target.value)}
            >
              {monthOptions.map((option) => (
                <option key={monthKey(option)} value={monthKey(option)}>
                  {option.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                </option>
              ))}
            </AppSelect>
          </label>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (formOpen) setFormOpen(false);
            else openFormForDay(selectedDay);
          }}
        >
          {formOpen ? <X size={16} /> : <Plus size={16} />} {formOpen ? "Cancelar" : "Novo compromisso"}
        </button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {formOpen && (
        <form className="inline-form section calendar-form" onSubmit={submit}>
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
                onChange={(event) => {
                  setForm({ ...form, date: event.target.value });
                  if (event.target.value) selectDay(event.target.value);
                }}
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
              <AppSelect
                id="kind"
                value={form.kind}
                onChange={(event) => setForm({ ...form, kind: event.target.value as CalendarEvent["kind"] })}
              >
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </AppSelect>
            </div>
            <div className="field">
              <label htmlFor="owner">Responsável</label>
              <AppSelect
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
              </AppSelect>
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

      <section className="calendar-page-layout">
        <div className="card calendar-main-card">
          <div className="calendar-main-toolbar">
            <div className="calendar-month-navigation">
              <button className="calendar-today-button" onClick={goToToday}>Hoje</button>
              <button className="calendar-arrow-button" onClick={() => shiftWeek(-1)} aria-label="Semana anterior">
                <ChevronLeft size={16} />
              </button>
              <button className="calendar-arrow-button" onClick={() => shiftWeek(1)} aria-label="Próxima semana">
                <ChevronRight size={16} />
              </button>
            </div>
            <h2>{weekRange.label}</h2>
            <span aria-hidden="true" />
          </div>

          <div className="calendar-week-scroll">
            <div className="calendar-week-grid" role="grid" aria-label={`Semana de ${shortDate(weekRange.first)} a ${shortDate(weekRange.last)}`}>
              {weekDays.map((day, index) => {
              const events = eventsByDay.get(day.date) ?? [];
              const isToday = day.date === data?.today;
              const isSelected = day.date === selectedDay;
              return (
                <div
                  key={day.date}
                  className={`calendar-week-column ${events.length ? "has-events" : ""} ${day.inMonth ? "" : "outside-month"} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
                  role="gridcell"
                  aria-selected={isSelected}
                >
                  <div className="calendar-week-heading">
                    <span className="calendar-weekday-label">{SHORT_WEEKDAYS[index]}</span>
                    <button className="calendar-day-select" onClick={() => selectDay(day.date)} aria-label={`Selecionar dia ${shortDate(day.date)}`}>
                      <span className="calendar-day">{day.day}</span>
                    </button>
                  </div>
                  <div className="calendar-week-events">
                    {events.slice(0, 4).map((event) => (
                      <button
                        key={event.id}
                        className={`calendar-week-event ${KIND_TONES[event.kind]} ${event.done ? "is-done" : ""}`}
                        title={`${event.time} · ${event.title}`}
                        onClick={() => selectDay(day.date)}
                      >
                        <span>{event.time}</span>
                        <strong>{event.title}</strong>
                      </button>
                    ))}
                    {events.length > 4 && <span className="calendar-more">+{events.length - 4} outros</span>}
                  </div>
                  <button className="calendar-week-add" onClick={() => openFormForDay(day.date)} aria-label={`Adicionar compromisso em ${shortDate(day.date)}`}>
                    <Plus size={13} /> <span>Adicionar</span>
                  </button>
                </div>
              );
              })}
            </div>
          </div>
        </div>

        <aside className="calendar-side-column">
          <section className="card mini-calendar-card" aria-label="Seletor de dia">
            <div className="mini-calendar-heading">
              <h2>{cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
              <div>
                <button className="mini-calendar-arrow" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
                  <ChevronLeft size={15} />
                </button>
                <button className="mini-calendar-arrow" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
            <div className="mini-calendar-grid" role="grid" aria-label="Dias do mês">
              {MINI_WEEKDAYS.map((weekday, index) => <span key={`${weekday}-${index}`} className="mini-calendar-weekday">{weekday}</span>)}
              {cells.map((day) => (
                <button
                  key={day.date}
                  className={`mini-calendar-day ${day.inMonth ? "" : "outside-month"} ${day.date === data?.today ? "is-today" : ""} ${day.date === selectedDay ? "is-selected" : ""} ${eventsByDay.has(day.date) ? "has-events" : ""}`}
                  onClick={() => selectDay(day.date)}
                  aria-label={`Selecionar dia ${day.day}`}
                  aria-pressed={day.date === selectedDay}
                >
                  {day.day}
                </button>
              ))}
            </div>
          </section>

          <section className="card day-agenda-card">
            <div className="calendar-agenda-heading">
              <div>
                <p className="calendar-date-label">{shortDate(selectedDay)}</p>
                <h2>Agenda do Dia</h2>
              </div>
              <span className="calendar-agenda-count">{dayEvents.length}</span>
            </div>
            <div className="calendar-agenda-list">
              {dayEvents.map((event) => (
                <article className={`calendar-agenda-event ${KIND_TONES[event.kind]}`} key={event.id}>
                  <button
                    className={`calendar-agenda-check ${event.done ? "done" : ""}`}
                    onClick={() => toggle(event)}
                    aria-label={event.done ? `Reabrir ${event.title}` : `Concluir ${event.title}`}
                  >
                    {event.done && <Check size={12} />}
                  </button>
                  <span className="calendar-agenda-dot" aria-hidden="true" />
                  <div className="calendar-agenda-info">
                    <span className="calendar-agenda-time">{event.time} · {event.durationMinutes} min</span>
                    <strong className={event.done ? "is-done" : ""}>{event.title}</strong>
                    <span className="calendar-agenda-owner">
                      {event.owner}{typeof event.amount === "number" && event.amount > 0 ? ` · ${brl(event.amount)}` : ""}
                      {event.auto && <span className="calendar-auto"><Zap size={10} /> auto</span>}
                    </span>
                  </div>
                  <span className={`calendar-kind-pill ${KIND_TONES[event.kind]}`}>{KIND_LABELS[event.kind]}</span>
                  <button className="calendar-delete-event" onClick={() => remove(event)} aria-label={`Excluir ${event.title}`}>
                    <Trash2 size={14} />
                  </button>
                </article>
              ))}
              {!dayEvents.length && !loading && <p className="calendar-empty-day">Nenhum compromisso neste dia.</p>}
              {loading && !data && <p className="calendar-empty-day">Carregando agenda...</p>}
            </div>
            <button className="calendar-full-day-button" onClick={() => openFormForDay(selectedDay)}>
              <Plus size={15} /> Adicionar compromisso
            </button>
          </section>
        </aside>
      </section>
    </div>
  );
}
