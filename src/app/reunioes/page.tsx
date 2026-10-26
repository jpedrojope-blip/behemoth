"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AppSelect } from "@/components/ui/app-select";
import {
  CalendarDays,
  Check,
  Clock3,
  ExternalLink,
  FileText,
  Mic,
  Plus,
  Save,
  Sparkles,
  Square,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useResource } from "@/lib/client";
import { shortDate } from "@/lib/format";
import type { ActionItem, Meeting } from "@/lib/types";

type Payload = { meetings: Meeting[]; openActionItems: number; people: string[] };
type MeetingTab = "schedule" | "room";
type ScheduleView = "upcoming" | "past";
type MeetingForm = { title: string; date: string; participants: string; meetingUrl: string };
type RecognitionAlternative = { transcript: string };
type RecognitionResult = ArrayLike<RecognitionAlternative>;
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function localDateTimeValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function emptyMeetingForm(): MeetingForm {
  return { title: "", date: localDateTimeValue(), participants: "", meetingUrl: "" };
}

function meetingDateTime(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(new Date(date));
}

function meetingDay(date: string) {
  const value = new Date(date);
  return {
    day: new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(value),
    month: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(value).replace(".", ""),
  };
}

export default function ReunioesPage() {
  const { data, loading, error } = useResource<Payload>("/api/meetings");
  const [activeTab, setActiveTab] = useState<MeetingTab>("schedule");
  const [scheduleView, setScheduleView] = useState<ScheduleView>("upcoming");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ notes: string; transcript: string }>({ notes: "", transcript: "" });
  const [newMeeting, setNewMeeting] = useState<MeetingForm>(emptyMeetingForm);
  const [formOpen, setFormOpen] = useState(false);
  const [newAction, setNewAction] = useState({ title: "", owner: "", due: "" });
  const [busy, setBusy] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const notify = useToast();

  const meetings = useMemo(() => data?.meetings ?? [], [data]);
  const selected = meetings.find((meeting) => meeting.id === selectedId) ?? null;
  const upcomingMeetings = useMemo(
    () => meetings
      .filter((meeting) => new Date(meeting.date).getTime() >= Date.now())
      .sort((left, right) => left.date.localeCompare(right.date)),
    [meetings],
  );
  const pastMeetings = useMemo(
    () => meetings
      .filter((meeting) => new Date(meeting.date).getTime() < Date.now())
      .sort((left, right) => right.date.localeCompare(left.date)),
    [meetings],
  );
  const visibleMeetings = scheduleView === "upcoming" ? upcomingMeetings : pastMeetings;

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("novo")) {
      setFormOpen(true);
      setActiveTab("schedule");
    }
  }, []);

  useEffect(() => {
    speechRecognitionRef.current?.stop();
    if (selected) setDraft({ notes: selected.notes, transcript: selected.transcript });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => speechRecognitionRef.current?.abort(), []);

  async function createMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const participants = newMeeting.participants
        .split(",")
        .map((person) => person.trim())
        .filter(Boolean);
      const result = await apiFetch<{ meeting: Meeting }>("/api/meetings", {
        method: "POST",
        body: JSON.stringify({
          title: newMeeting.title,
          date: new Date(newMeeting.date).toISOString(),
          participants,
          meetingUrl: newMeeting.meetingUrl.trim(),
        }),
      });
      notify("Reunião agendada.", "success");
      setNewMeeting(emptyMeetingForm());
      setFormOpen(false);
      setSelectedId(result.meeting.id);
      setActiveTab("room");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao agendar reunião.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch("/api/meetings/" + selected.id, { method: "PATCH", body: JSON.stringify(draft) });
      notify("Notas e transcrição salvas.", "success");
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
      await apiFetch("/api/meetings/" + selected.id, { method: "PATCH", body: JSON.stringify(draft) });
      const result = await apiFetch<{ suggestedActionItems: { title: string }[] }>(
        "/api/meetings/" + selected.id + "/summary",
        { method: "POST" },
      );
      notify("Resumo gerado a partir de " + result.suggestedActionItems.length + " trecho(s) relevantes.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao gerar resumo.", "error");
    } finally {
      setBusy(false);
    }
  }

  function toggleTranscription() {
    if (isTranscribing) {
      speechRecognitionRef.current?.stop();
      setIsTranscribing(false);
      return;
    }

    const browserWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      notify("A transcrição por voz não está disponível neste navegador. Você pode colar o texto no campo.", "error");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .slice(event.resultIndex)
        .map((result) => result[0]?.transcript.trim() ?? "")
        .filter(Boolean)
        .join(" ");
      if (text) setDraft((current) => ({ ...current, transcript: [current.transcript.trim(), text].filter(Boolean).join(" ") }));
    };
    recognition.onerror = (event) => {
      setIsTranscribing(false);
      const message = event.error === "not-allowed"
        ? "Permita o acesso ao microfone para transcrever por voz."
        : "Não foi possível transcrever o áudio. Você ainda pode colar a transcrição no campo.";
      notify(message, "error");
    };
    recognition.onend = () => setIsTranscribing(false);
    speechRecognitionRef.current = recognition;

    try {
      recognition.start();
      setIsTranscribing(true);
    } catch {
      setIsTranscribing(false);
      notify("Não foi possível iniciar a transcrição por voz.", "error");
    }
  }

  async function saveActionItems(items: ActionItem[]) {
    if (!selected) return;
    try {
      await apiFetch("/api/meetings/" + selected.id, { method: "PATCH", body: JSON.stringify({ actionItems: items }) });
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao atualizar ações.", "error");
    }
  }

  async function addActionItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !newAction.title.trim()) return;
    await saveActionItems([
      ...selected.actionItems,
      { id: "", title: newAction.title.trim(), owner: newAction.owner, due: newAction.due, done: false },
    ]);
    setNewAction({ title: "", owner: "", due: "" });
  }

  async function removeMeeting(meeting: Meeting) {
    if (!window.confirm("Excluir a reunião \"" + meeting.title + "\"?")) return;
    try {
      await apiFetch("/api/meetings/" + meeting.id, { method: "DELETE" });
      setSelectedId(null);
      setActiveTab("schedule");
      notify("Reunião excluída.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao excluir.", "error");
    }
  }

  function openRoom(meeting: Meeting) {
    setSelectedId(meeting.id);
    setActiveTab("room");
  }

  function openCreateForm() {
    setActiveTab("schedule");
    setFormOpen((open) => !open);
  }

  return (
    <div className="page-wrap meetings-page">
      <div className="page-head">
        <div>
          <p className="card-kicker">REUNIÕES</p>
          <h1 className="page-title">Agenda e sala de reunião</h1>
          <p className="subtitle">Organize seus encontros, registre decisões e acompanhe as próximas ações.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateForm} type="button">
          {formOpen ? <X size={16} /> : <Plus size={16} />} {formOpen ? "Cancelar" : "Nova reunião"}
        </button>
      </div>

      <div className="tabs meeting-tabs" role="tablist" aria-label="Área de reuniões">
        <button
          id="meeting-schedule-tab"
          className={activeTab === "schedule" ? "tab active" : "tab"}
          role="tab"
          aria-selected={activeTab === "schedule"}
          aria-controls="meeting-schedule-panel"
          onClick={() => setActiveTab("schedule")}
          type="button"
        >
          <CalendarDays size={15} /> Agenda de reuniões <span className="meeting-tab-count">{meetings.length}</span>
        </button>
        <button
          id="meeting-room-tab"
          className={activeTab === "room" ? "tab active" : "tab"}
          role="tab"
          aria-selected={activeTab === "room"}
          aria-controls="meeting-room-panel"
          onClick={() => setActiveTab("room")}
          type="button"
        >
          <Video size={15} /> Sala de reunião
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {activeTab === "schedule" && (
        <section id="meeting-schedule-panel" className="meeting-schedule-panel" role="tabpanel" aria-labelledby="meeting-schedule-tab">
          <div className="meeting-stats">
            <article className="card meeting-stat-card">
              <span className="meeting-stat-icon is-blue"><CalendarDays size={18} /></span>
              <div><small>Próximas reuniões</small><strong>{upcomingMeetings.length}</strong></div>
            </article>
            <article className="card meeting-stat-card">
              <span className="meeting-stat-icon is-purple"><Users size={18} /></span>
              <div><small>Participantes agendados</small><strong>{upcomingMeetings.reduce((total, meeting) => total + meeting.participants.length, 0)}</strong></div>
            </article>
            <article className="card meeting-stat-card">
              <span className="meeting-stat-icon is-green"><Check size={18} /></span>
              <div><small>Ações em aberto</small><strong>{data?.openActionItems ?? 0}</strong></div>
            </article>
          </div>

          {formOpen && (
            <form className="card meeting-create-form section" onSubmit={createMeeting}>
              <div className="card-head">
                <div>
                  <p className="card-kicker">NOVA REUNIÃO</p>
                  <h2>Adicione ao calendário</h2>
                </div>
                <button className="icon-action" type="button" aria-label="Fechar formulário" onClick={() => setFormOpen(false)}><X size={16} /></button>
              </div>
              <div className="meeting-form-grid">
                <div className="field">
                  <label htmlFor="meeting-title">Título</label>
                  <input id="meeting-title" value={newMeeting.title} onChange={(event) => setNewMeeting({ ...newMeeting, title: event.target.value })} placeholder="Revisão de resultados" required />
                </div>
                <div className="field">
                  <label htmlFor="meeting-date">Data e horário</label>
                  <input id="meeting-date" type="datetime-local" value={newMeeting.date} onChange={(event) => setNewMeeting({ ...newMeeting, date: event.target.value })} required />
                </div>
                <div className="field">
                  <label htmlFor="meeting-participants">Participantes</label>
                  <input id="meeting-participants" value={newMeeting.participants} onChange={(event) => setNewMeeting({ ...newMeeting, participants: event.target.value })} placeholder="Nomes separados por vírgula" />
                </div>
                <div className="field">
                  <label htmlFor="meeting-url">Link para entrar (opcional)</label>
                  <input id="meeting-url" type="url" value={newMeeting.meetingUrl} onChange={(event) => setNewMeeting({ ...newMeeting, meetingUrl: event.target.value })} placeholder="https://meet.google.com/..." />
                </div>
              </div>
              <div className="meeting-form-footer">
                <p className="small muted">A sala de trabalho abre dentro do sistema. Se houver um link, você também pode entrar na chamada externa.</p>
                <button className="btn btn-primary" type="submit" disabled={busy}><CalendarDays size={15} /> Agendar reunião</button>
              </div>
            </form>
          )}

          <section className="card meeting-agenda-card section">
            <div className="card-head meeting-agenda-head">
              <div>
                <p className="card-kicker">SUA AGENDA</p>
                <h2>{scheduleView === "upcoming" ? "Reuniões próximas" : "Reuniões anteriores"}</h2>
              </div>
              <div className="tabs meeting-period-tabs" role="group" aria-label="Filtrar reuniões">
                <button className={scheduleView === "upcoming" ? "tab active" : "tab"} type="button" onClick={() => setScheduleView("upcoming")}>Próximas <span>{upcomingMeetings.length}</span></button>
                <button className={scheduleView === "past" ? "tab active" : "tab"} type="button" onClick={() => setScheduleView("past")}>Anteriores <span>{pastMeetings.length}</span></button>
              </div>
            </div>

            {loading && !data ? (
              <p className="loading">Carregando reuniões...</p>
            ) : visibleMeetings.length ? (
              <div className="meeting-agenda-list">
                {visibleMeetings.map((meeting) => {
                  const date = meetingDay(meeting.date);
                  const openActions = meeting.actionItems.filter((item) => !item.done).length;
                  return (
                    <article className="meeting-agenda-item" key={meeting.id}>
                      <div className="meeting-date-badge"><strong>{date.day}</strong><span>{date.month}</span></div>
                      <div className="meeting-agenda-content">
                        <div className="meeting-agenda-title-row">
                          <div>
                            <h3>{meeting.title}</h3>
                            <p><Clock3 size={14} /> {meetingDateTime(meeting.date)}</p>
                          </div>
                          <span className={scheduleView === "upcoming" ? "meeting-state is-upcoming" : "meeting-state is-past"}>
                            {scheduleView === "upcoming" ? "Agendada" : "Realizada"}
                          </span>
                        </div>
                        {!!meeting.participants.length && (
                          <div className="meeting-participants"><Users size={14} /><span>{meeting.participants.join(" · ")}</span></div>
                        )}
                        <div className="meeting-agenda-footer">
                          <span className="small muted">{openActions ? openActions + " ação(ões) em aberto" : "Sem ações pendentes"}</span>
                          <div className="meeting-agenda-actions">
                            {meeting.meetingUrl && (
                              <a className="btn btn-ghost" href={meeting.meetingUrl} target="_blank" rel="noreferrer">
                                <ExternalLink size={14} /> Entrar na chamada
                              </a>
                            )}
                            <button className="btn btn-primary" type="button" onClick={() => openRoom(meeting)}>
                              <FileText size={14} /> {scheduleView === "upcoming" ? "Abrir sala" : "Ver reunião"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="meeting-empty">
                <span className="meeting-empty-icon"><CalendarDays size={21} /></span>
                <h3>{scheduleView === "upcoming" ? "Nenhuma reunião agendada" : "Seu histórico está vazio"}</h3>
                <p>{scheduleView === "upcoming" ? "Agende um encontro para organizar os participantes e preparar a sala." : "As reuniões realizadas aparecerão aqui."}</p>
                {scheduleView === "upcoming" && <button className="btn btn-primary" type="button" onClick={() => setFormOpen(true)}><Plus size={15} /> Agendar primeira reunião</button>}
              </div>
            )}
          </section>
        </section>
      )}

      {activeTab === "room" && (
        <section id="meeting-room-panel" className="meeting-room-panel" role="tabpanel" aria-labelledby="meeting-room-tab">
          <div className="card meeting-room-header section">
            <div className="meeting-room-title">
              <span className="meeting-room-icon"><Video size={20} /></span>
              <div>
                <p className="card-kicker">SALA DE TRABALHO</p>
                <h2>{selected?.title ?? "Escolha uma reunião"}</h2>
                <p className="subtitle">{selected ? meetingDateTime(selected.date) : "Abra uma reunião da agenda para começar a registrar."}</p>
              </div>
            </div>
            <div className="meeting-room-toolbar">
              <div className="meeting-room-select">
                <label htmlFor="room-meeting-select">Reunião</label>
                <AppSelect id="room-meeting-select" aria-label="Selecionar reunião" value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
                  <option value="" disabled>Selecione uma reunião</option>
                  {meetings.map((meeting) => <option key={meeting.id} value={meeting.id}>{meeting.title}</option>)}
                </AppSelect>
              </div>
              {selected?.meetingUrl && <a className="btn btn-primary" href={selected.meetingUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Entrar na chamada</a>}
              {selected && <button className="icon-action danger" type="button" title="Excluir reunião" aria-label="Excluir reunião" onClick={() => void removeMeeting(selected)}><Trash2 size={15} /></button>}
            </div>
          </div>

          {!selected ? (
            <div className="card meeting-empty section">
              <span className="meeting-empty-icon"><FileText size={21} /></span>
              <h3>Nenhuma reunião selecionada</h3>
              <p>Escolha uma reunião agendada ou crie uma nova para abrir a sala de trabalho.</p>
              <button className="btn btn-primary" type="button" onClick={() => setActiveTab("schedule")}><CalendarDays size={15} /> Ir para a agenda</button>
            </div>
          ) : (
            <div className="meeting-room-grid section">
              <section className="card meeting-room-editor">
                <div className="card-head">
                  <div>
                    <p className="card-kicker">REGISTRO DO ENCONTRO</p>
                    <h2>Notas e transcrição</h2>
                  </div>
                  <span className="meeting-live-label"><span /> Sala pronta</span>
                </div>

                <div className="field meeting-editor-field">
                  <label htmlFor="meeting-notes">Anotações</label>
                  <textarea
                    id="meeting-notes"
                    value={draft.notes}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                    placeholder="Registre decisões, contexto e próximos passos..."
                  />
                </div>
                <div className="field meeting-editor-field">
                  <div className="meeting-field-label-row">
                    <label htmlFor="meeting-transcript">Transcrição</label>
                    <button className={isTranscribing ? "btn btn-ghost is-recording" : "btn btn-ghost"} type="button" onClick={toggleTranscription}>
                      {isTranscribing ? <Square size={13} /> : <Mic size={14} />}
                      {isTranscribing ? "Parar transcrição" : "Transcrever pelo microfone"}
                    </button>
                  </div>
                  <textarea
                    id="meeting-transcript"
                    value={draft.transcript}
                    onChange={(event) => setDraft({ ...draft, transcript: event.target.value })}
                    placeholder="Cole a transcrição para gerar um resumo e identificar ações..."
                  />
                  <p className="meeting-transcript-hint">Você também pode colar uma transcrição. A transcrição por voz usa o reconhecimento do navegador e o microfone do dispositivo.</p>
                </div>
                <div className="meeting-editor-footer">
                  <p className="small muted">O resumo é montado localmente a partir das anotações e da transcrição salvas.</p>
                  <button className="btn btn-ghost" type="button" onClick={() => void saveDraft()} disabled={busy}><Save size={15} /> Salvar registro</button>
                </div>
              </section>

              <aside className="meeting-room-sidebar">
                <section className="card meeting-summary-card">
                  <div className="card-head">
                    <div><p className="card-kicker">SÍNTESE</p><h2>Resumo da reunião</h2></div>
                    <Sparkles size={18} className="meeting-summary-sparkle" />
                  </div>
                  {selected.summary ? <p className="meeting-summary-text">{selected.summary}</p> : <p className="empty meeting-summary-empty">Salve as anotações ou a transcrição para criar um resumo.</p>}
                  <button className="btn btn-primary meeting-summary-button" type="button" onClick={() => void generateSummary()} disabled={busy || (!draft.notes.trim() && !draft.transcript.trim())}>
                    <Sparkles size={15} /> Gerar resumo
                  </button>
                </section>

                <section className="card meeting-actions-card">
                  <div className="card-head">
                    <div><p className="card-kicker">PRÓXIMOS PASSOS</p><h2>Itens de ação</h2></div>
                    <span className="meeting-action-count">{selected.actionItems.filter((item) => !item.done).length} em aberto</span>
                  </div>
                  <div className="meeting-action-list">
                    {selected.actionItems.map((item) => (
                      <div className="meeting-action-item" key={item.id}>
                        <button
                          className={item.done ? "check done" : "check"}
                          type="button"
                          aria-label={item.done ? "Reabrir ação" : "Concluir ação"}
                          onClick={() => void saveActionItems(selected.actionItems.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry))}
                        >
                          {item.done && <Check size={13} />}
                        </button>
                        <div className="grow">
                          <strong className={item.done ? "meeting-action-done" : ""}>{item.title}</strong>
                          <span>{item.owner || "Sem responsável"}{item.due ? " · até " + shortDate(item.due) : ""}</span>
                        </div>
                        <button className="icon-action danger" type="button" aria-label="Remover ação" title="Remover" onClick={() => void saveActionItems(selected.actionItems.filter((entry) => entry.id !== item.id))}><Trash2 size={14} /></button>
                      </div>
                    ))}
                    {!selected.actionItems.length && <p className="empty meeting-no-actions">Nenhum próximo passo registrado.</p>}
                  </div>
                  <form className="meeting-action-form" onSubmit={addActionItem}>
                    <div className="field">
                      <label htmlFor="meeting-action-title">Adicionar ação</label>
                      <input id="meeting-action-title" value={newAction.title} onChange={(event) => setNewAction({ ...newAction, title: event.target.value })} placeholder="Definir próximo passo" required />
                    </div>
                    <div className="meeting-action-fields">
                      <div className="field">
                        <label htmlFor="meeting-action-owner">Responsável</label>
                        <AppSelect id="meeting-action-owner" aria-label="Responsável pela ação" value={newAction.owner} onChange={(event) => setNewAction({ ...newAction, owner: event.target.value })}>
                          <option value="">Selecione</option>
                          {(data?.people ?? []).map((person) => <option key={person} value={person}>{person}</option>)}
                        </AppSelect>
                      </div>
                      <div className="field">
                        <label htmlFor="meeting-action-due">Prazo</label>
                        <input id="meeting-action-due" type="date" value={newAction.due} onChange={(event) => setNewAction({ ...newAction, due: event.target.value })} />
                      </div>
                    </div>
                    <button className="btn btn-ghost" type="submit"><Plus size={15} /> Adicionar ação</button>
                  </form>
                </section>
              </aside>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
