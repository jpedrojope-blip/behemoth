"use client";

import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Database, RotateCcw, Save, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { apiFetch, useResource } from "@/lib/client";
import type { Automations, Company, Role } from "@/lib/types";

type Payload = {
  company: Company;
  automations: Automations;
  permissions: { read: boolean; write: boolean; admin: boolean };
  integrations: {
    supabase: boolean;
    supabaseService: boolean;
    google: boolean;
    whatsapp: boolean;
    ai: boolean;
    aiProvider: string;
  };
  persistent: boolean;
  counts: {
    transactions: number;
    automatedTransactions: number;
    team: number;
    meetings: number;
    events: number;
    automatedEvents: number;
  };
  audit: { id: string; at: string; actor: string; action: string; entity: string; entityId: string; auto?: boolean }[];
};

const AUTOMATION_LABELS: { key: keyof Automations; label: string; hint: string }[] = [
  {
    key: "recurringTransactions",
    label: "Lançamentos recorrentes",
    hint: "Um lançamento marcado como mensal se repete sozinho nos meses seguintes.",
  },
  {
    key: "teamCostToExpenses",
    label: "Custo da equipe vira despesa",
    hint: "O custo mensal dos integrantes ativos entra no financeiro como despesa do mês.",
  },
  {
    key: "actionItemsToCalendar",
    label: "Itens de ação viram tarefas",
    hint: "Todo item de ação com prazo aparece no calendário — concluir num lugar conclui no outro.",
  },
  {
    key: "meetingsToCalendar",
    label: "Reuniões no calendário",
    hint: "Cada reunião agendada aparece automaticamente na agenda.",
  },
  {
    key: "paymentsToExpenses",
    label: "Pagamento concluído vira despesa",
    hint: "Um pagamento com valor gera o lançamento no financeiro assim que é marcado como feito.",
  },
];

const INTEGRATION_LABELS: { key: keyof Payload["integrations"]; label: string; hint: string }[] = [
  { key: "supabase", label: "Supabase (banco)", hint: "NEXT_PUBLIC_SUPABASE_URL + ANON_KEY" },
  { key: "supabaseService", label: "Supabase (escrita server-side)", hint: "SUPABASE_SERVICE_ROLE_KEY" },
  { key: "google", label: "Google Calendar / Meet", hint: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET" },
  { key: "whatsapp", label: "WhatsApp Cloud API", hint: "META_WHATSAPP_ACCESS_TOKEN + PHONE_NUMBER_ID" },
  { key: "ai", label: "Provedor de IA", hint: "AI_PROVIDER + AI_API_KEY" },
];

export default function ConfiguracoesPage() {
  const { data, error } = useResource<Payload>("/api/settings");
  const [form, setForm] = useState<Partial<Company>>({});
  const [saving, setSaving] = useState(false);
  const notify = useToast();

  useEffect(() => {
    if (data?.company) setForm(data.company);
  }, [data?.company]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify(form) });
      notify("Configurações salvas.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao salvar.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAutomation(key: keyof Automations, value: boolean) {
    try {
      await apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify({ automations: { [key]: value } }) });
      notify(value ? "Automação ligada." : "Automação desligada.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao atualizar.", "error");
    }
  }

  async function reset(mode: "demo" | "empty") {
    const message =
      mode === "empty"
        ? "Isso apaga TODOS os lançamentos, integrantes, reuniões e eventos. Continuar?"
        : "Isso substitui os dados atuais pelos dados de demonstração. Continuar?";
    if (!window.confirm(message)) return;
    try {
      await apiFetch("/api/settings/reset", { method: "POST", body: JSON.stringify({ mode }) });
      notify(mode === "empty" ? "Workspace zerado." : "Dados de demonstração restaurados.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Erro ao redefinir.", "error");
    }
  }

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <p className="eyebrow">CONFIGURAÇÕES</p>
          <h1 className="page-title">Empresa, dados e integrações</h1>
          <p className="subtitle">Os dados ficam gravados no servidor da aplicação e alimentam todos os módulos.</p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <section className="section split">
        <form className="card" onSubmit={save}>
          <div className="card-head">
            <div>
              <p className="card-kicker">EMPRESA</p>
              <h2>Dados do workspace</h2>
            </div>
          </div>
          <div className="form-grid" style={{ marginTop: 18 }}>
            <div className="field">
              <label htmlFor="name">Nome da empresa</label>
              <input
                id="name"
                value={form.name ?? ""}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="niche">Nicho</label>
              <input
                id="niche"
                value={form.niche ?? ""}
                onChange={(event) => setForm({ ...form, niche: event.target.value })}
                placeholder="Agência, e-commerce, serviços..."
              />
            </div>
            <div className="field">
              <label htmlFor="plan">Plano</label>
              <select
                id="plan"
                value={form.plan ?? "Pro"}
                onChange={(event) => setForm({ ...form, plan: event.target.value })}
              >
                <option>Basic</option>
                <option>Pro</option>
                <option>Enterprise</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ownerName">Seu nome</label>
              <input
                id="ownerName"
                value={form.ownerName ?? ""}
                onChange={(event) => setForm({ ...form, ownerName: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ownerRole">Permissão</label>
              <select
                id="ownerRole"
                value={form.ownerRole ?? "ADMIN"}
                onChange={(event) => setForm({ ...form, ownerRole: event.target.value as Role })}
              >
                <option value="ADMIN">Administrador</option>
                <option value="MANAGER">Gestor</option>
                <option value="MEMBER">Membro</option>
              </select>
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              <Save size={15} /> {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>

        <div className="card">
          <div className="card-head">
            <div>
              <p className="card-kicker">INTEGRAÇÕES</p>
              <h2>O que já está conectado</h2>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            {INTEGRATION_LABELS.map((integration) => {
              const active = Boolean(data?.integrations[integration.key]);
              return (
                <div className="list-item" key={integration.key}>
                  <div className="grow">
                    <strong>{integration.label}</strong>
                    <span>{integration.hint}</span>
                  </div>
                  <span className={`pill ${active ? "green" : "gray"}`}>
                    {active ? <CircleCheck size={12} /> : <CircleAlert size={12} />}
                    {active ? "Ativo" : "Pendente"}
                  </span>
                </div>
              );
            })}
            <div className="list-item">
              <div className="grow">
                <strong>Armazenamento</strong>
                <span>{data?.persistent ? "Arquivo local .data/behemoth.json" : "Memória (sem escrita em disco)"}</span>
              </div>
              <span className={`pill ${data?.persistent ? "green" : "amber"}`}>
                <Database size={12} /> {data?.persistent ? "Persistente" : "Volátil"}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="section card">
        <div className="card-head">
          <div>
            <p className="card-kicker">AUTOMAÇÕES</p>
            <h2>O que o sistema faz sozinho</h2>
            <p className="subtitle">
              Regras que ligam os módulos. Rodam a cada leitura e são idempotentes — nada é duplicado.
            </p>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          {AUTOMATION_LABELS.map((automation) => {
            const active = Boolean(data?.automations?.[automation.key]);
            return (
              <div className="list-item" key={automation.key}>
                <div className="grow">
                  <strong>{automation.label}</strong>
                  <span>{automation.hint}</span>
                </div>
                <button
                  className={`switch ${active ? "on" : ""}`}
                  role="switch"
                  aria-checked={active}
                  aria-label={automation.label}
                  onClick={() => toggleAutomation(automation.key, !active)}
                  disabled={!data}
                >
                  <i />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section split">
        <div className="card">
          <div className="card-head">
            <div>
              <p className="card-kicker">HISTÓRICO</p>
              <h2>Últimas alterações</h2>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            {(data?.audit ?? []).map((entry) => (
              <div className="list-item" key={entry.id}>
                <div className="grow">
                  <strong style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    {entry.action} · {entry.entity}
                    {entry.auto && <span className="pill purple">auto</span>}
                  </strong>
                  <span>
                    {entry.actor} · {new Date(entry.at).toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>
            ))}
            {!data?.audit.length && <p className="empty">Nenhuma alteração registrada ainda.</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <p className="card-kicker">DADOS</p>
              <h2>Registros no workspace</h2>
            </div>
          </div>
          <div className="stat-grid" style={{ marginTop: 16, gridTemplateColumns: "1fr 1fr" }}>
            <div className="stat">
              <span>Lançamentos</span>
              <strong>{data?.counts.transactions ?? 0}</strong>
              <small>{data?.counts.automatedTransactions ?? 0} automáticos</small>
            </div>
            <div className="stat">
              <span>Equipe</span>
              <strong>{data?.counts.team ?? 0}</strong>
            </div>
            <div className="stat">
              <span>Reuniões</span>
              <strong>{data?.counts.meetings ?? 0}</strong>
            </div>
            <div className="stat">
              <span>Eventos</span>
              <strong>{data?.counts.events ?? 0}</strong>
              <small>{data?.counts.automatedEvents ?? 0} automáticos</small>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" onClick={() => reset("demo")}>
              <RotateCcw size={15} /> Restaurar demonstração
            </button>
            <button className="btn btn-danger" onClick={() => reset("empty")}>
              <Trash2 size={15} /> Zerar e usar dados reais
            </button>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            Zerar remove os dados de exemplo para você cadastrar os números da sua empresa do zero.
          </p>
        </div>
      </section>
    </div>
  );
}
