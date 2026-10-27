import type { BrazilianStateCode } from "@/lib/locations";

export type Role = "ADMIN" | "MANAGER" | "MEMBER";
export type TransactionKind = "INCOME" | "EXPENSE";
export type TransactionStatus = "CONFIRMED" | "PENDING";
export type Recurrence = "NONE" | "MONTHLY";
export type FinancialReport = "BOTH" | "DRE" | "DFC";
export type CostBehavior = "AUTO" | "FIXED" | "VARIABLE";

export type Company = {
  id: string;
  name: string;
  niche: string;
  plan: string;
  ownerName: string;
  ownerRole: Role;
  /** Saldo consolidado informado no início de cashOpeningDate. */
  cashOpeningBalance?: number;
  cashOpeningDate?: string;
};

/** Regras que o sistema executa sozinho a cada leitura ou escrita. */
export type Automations = {
  /** Replica lançamentos marcados como mensais nos meses seguintes. */
  recurringTransactions: boolean;
  /** Registra salários da equipe e custos de agentes como despesas mensais no financeiro. */
  teamCostToExpenses: boolean;
  /** Cria uma tarefa no calendário para cada item de ação com prazo. */
  actionItemsToCalendar: boolean;
  /** Cria um compromisso no calendário para cada reunião agendada. */
  meetingsToCalendar: boolean;
  /** Gera a despesa quando um pagamento agendado é concluído. */
  paymentsToExpenses: boolean;
};

export type Transaction = {
  id: string;
  companyId: string;
  kind: TransactionKind;
  date: string;
  description: string;
  /** Cliente, fornecedor ou pessoa favorecida pelo lançamento, quando informado. */
  counterparty?: string;
  category: string;
  /** Código contábil de origem; permite agrupar contas sem depender do texto da categoria. */
  accountCode?: string;
  amount: number;
  source?: string;
  /** Chave que identifica uma importação em lote e evita duplicar a mesma confirmação. */
  importBatchId?: string;
  status: TransactionStatus;
  recurrence?: Recurrence;
  /** Relatórios em que o lançamento entra. Ausente = competência da DRE, sem presumir liquidação. */
  financialReport?: FinancialReport;
  /** Data de competência da DRE; ausente = date. */
  competenceDate?: string;
  /** Data de liquidação do fluxo de caixa; ausência não significa que houve pagamento. */
  cashDate?: string;
  /** Confirma que a data de caixa foi informada para um lançamento BOTH. */
  cashDateConfirmed?: boolean;
  /** Classificação usada pelo cálculo da margem de contribuição. */
  costBehavior?: CostBehavior;
  /** Id do lançamento que originou esta cópia recorrente. */
  originId?: string;
  /** Marca lançamentos criados por automação e sincronizados com a origem correspondente. */
  auto?: boolean;
};

export type TeamMember = {
  id: string;
  companyId: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  location: string;
  locationState?: BrazilianStateCode | "";
  locationCity?: string;
  bio?: string;
  startDate?: string;
  manager?: string;
  avatarDataUrl?: string;
  employmentType?: "CLT" | "PJ" | "INTERN" | "TEMPORARY" | "OTHER" | "";
  skills?: string[];
  type: "HUMAN" | "AI";
  role: string;
  /** Custo mensal cadastrado para cada integrante. */
  monthlyCost: number;
  agentProvider?: string;
  agentModel?: string;
  agentPurpose?: string;
  agentIntegrations?: string[];
  status: "ACTIVE" | "REVIEW";
};

export type TeamMemberMetrics = {
  assignedTasks: number;
  completedTasks: number;
  completionRate: number;
  finalizedValue: number;
  roi: number | null;
  nextTaskTitle: string | null;
  nextTaskDueDate: string | null;
};

export type TeamMemberProfile = TeamMember & { metrics: TeamMemberMetrics };

export type TeamTaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

export type TeamTask = {
  id: string;
  title: string;
  details: string;
  assigneeId: string | null;
  dueDate: string;
  status: TeamTaskStatus;
  createdAt: string;
  updatedAt: string;
};

export type PipelineTone = "blue" | "violet" | "amber" | "green" | "rose";

export type PipelineStage = {
  id: string;
  name: string;
  tone: PipelineTone;
};

export type SalesOpportunity = {
  id: string;
  title: string;
  company: string;
  contact: string;
  amount: number;
  ownerId: string | null;
  nextStep: string;
  dueDate: string;
  stageId: string;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  { id: "stage-new", name: "Novo", tone: "blue" },
  { id: "stage-contacted", name: "Abordado", tone: "violet" },
  { id: "stage-finished", name: "Finalizado", tone: "green" },
];

export function defaultPipelineStages(): PipelineStage[] {
  return DEFAULT_PIPELINE_STAGES.map((stage) => ({ ...stage }));
}

export type ActionItem = {
  id: string;
  title: string;
  owner: string;
  due: string;
  done: boolean;
};

export type Meeting = {
  id: string;
  companyId: string;
  title: string;
  date: string;
  meetingUrl?: string;
  participants: string[];
  notes: string;
  transcript: string;
  summary: string;
  actionItems: ActionItem[];
};

export type CalendarEvent = {
  id: string;
  companyId: string;
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  kind: "MEETING" | "TASK" | "PAYMENT" | "EVENT";
  owner: string;
  done: boolean;
  /** Valor do pagamento — vira despesa quando concluído. */
  amount?: number;
  /** Origem quando o evento foi criado por automação. */
  auto?: boolean;
  linkedMeetingId?: string;
  linkedActionItemId?: string;
};

export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  auto?: boolean;
};

export type Database = {
  company: Company;
  automations: Automations;
  transactions: Transaction[];
  team: TeamMember[];
  teamTasks: TeamTask[];
  pipelineStages: PipelineStage[];
  opportunities: SalesOpportunity[];
  meetings: Meeting[];
  events: CalendarEvent[];
  audit: AuditEntry[];
  /** Ids de itens automáticos que o usuário apagou — não são recriados. */
  dismissed: string[];
};

export type Insight = {
  id: string;
  type: "positive" | "attention" | "neutral";
  title: string;
  text: string;
  evidence: Record<string, number | string>;
};

export const DEFAULT_AUTOMATIONS: Automations = {
  recurringTransactions: true,
  teamCostToExpenses: true,
  actionItemsToCalendar: true,
  meetingsToCalendar: true,
  paymentsToExpenses: true,
};
