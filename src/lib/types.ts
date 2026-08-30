export type Role = "ADMIN" | "MANAGER" | "MEMBER";
export type TransactionKind = "INCOME" | "EXPENSE";
export type TransactionStatus = "CONFIRMED" | "PENDING";
export type Recurrence = "NONE" | "MONTHLY";

export type Company = {
  id: string;
  name: string;
  niche: string;
  plan: string;
  ownerName: string;
  ownerRole: Role;
};

/** Regras que o sistema executa sozinho a cada leitura ou escrita. */
export type Automations = {
  /** Replica lançamentos marcados como mensais nos meses seguintes. */
  recurringTransactions: boolean;
  /** Lança o custo mensal da equipe como despesa do mês corrente. */
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
  category: string;
  amount: number;
  source?: string;
  status: TransactionStatus;
  recurrence?: Recurrence;
  /** Id do lançamento que originou esta cópia recorrente. */
  originId?: string;
  /** Marca lançamentos criados por automação — não editáveis à mão. */
  auto?: boolean;
};

export type TeamMember = {
  id: string;
  companyId: string;
  name: string;
  type: "HUMAN" | "AI";
  role: string;
  performance: number;
  target: number;
  monthlyCost: number;
  roi: number;
  status: "ACTIVE" | "REVIEW";
};

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
