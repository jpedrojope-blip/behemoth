import { DEFAULT_AUTOMATIONS, defaultPipelineStages, type Database } from "@/lib/types";

const COMPANY_ID = "company_acme";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthsAgo(months: number, day: number) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - months, day);
  return isoDate(date);
}

function daysFromToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

const history: { month: number; income: number[]; expense: number[] }[] = [
  { month: 7, income: [18400, 9200], expense: [3800, 1650, 320] },
  { month: 6, income: [21500, 8900], expense: [4100, 1720, 410] },
  { month: 5, income: [19800, 14300], expense: [3950, 1680, 380] },
  { month: 4, income: [26400, 11200], expense: [4300, 1750, 440] },
  { month: 3, income: [24900, 13800], expense: [4150, 1790, 360] },
  { month: 2, income: [29100, 12600], expense: [4420, 1810, 470] },
  { month: 1, income: [31200, 10400], expense: [4380, 1780, 390] },
];

const incomeLabels = ["Contrato recorrente", "Projeto pontual"];
const expenseLabels: [string, string][] = [
  ["Google Ads", "Marketing"],
  ["AWS", "Tecnologia"],
  ["Serviços administrativos", "Administrativo"],
];

function historyTransactions() {
  return history.flatMap((entry, entryIndex) => [
    ...entry.income.map((amount, index) => ({
      id: `tx_h${entryIndex}_i${index}`,
      companyId: COMPANY_ID,
      kind: "INCOME" as const,
      date: monthsAgo(entry.month, 5 + index * 8),
      description: incomeLabels[index],
      category: "Receita",
      amount,
      source: "seed",
      status: "CONFIRMED" as const,
    })),
    ...entry.expense.map((amount, index) => ({
      id: `tx_h${entryIndex}_e${index}`,
      companyId: COMPANY_ID,
      kind: "EXPENSE" as const,
      date: monthsAgo(entry.month, 6 + index * 6),
      description: expenseLabels[index][0],
      category: expenseLabels[index][1],
      amount,
      source: "seed",
      status: "CONFIRMED" as const,
    })),
  ]);
}

export function createSeed(): Database {
  const today = new Date();
  const todayIso = isoDate(today);

  return {
    company: {
      id: COMPANY_ID,
      name: "Acme Corp",
      niche: "Agência",
      plan: "Pro",
      ownerName: "Rafael Martins",
      ownerRole: "ADMIN",
    },
    automations: { ...DEFAULT_AUTOMATIONS },
    transactions: [
      ...historyTransactions(),
      { id: "tx_1", companyId: COMPANY_ID, kind: "INCOME", date: monthsAgo(0, 5), description: "Cliente ABC", category: "Receita", amount: 12000, source: "import", status: "CONFIRMED" },
      { id: "tx_2", companyId: COMPANY_ID, kind: "INCOME", date: monthsAgo(0, 12), description: "Projeto Atlas", category: "Receita", amount: 33590, source: "manual", status: "CONFIRMED" },
      { id: "tx_3", companyId: COMPANY_ID, kind: "EXPENSE", date: monthsAgo(0, 8), description: "Google Ads", category: "Marketing", amount: 4500, source: "import", status: "CONFIRMED" },
      { id: "tx_4", companyId: COMPANY_ID, kind: "EXPENSE", date: monthsAgo(0, 14), description: "AWS", category: "Tecnologia", amount: 1800, source: "import", status: "CONFIRMED" },
      { id: "tx_5", companyId: COMPANY_ID, kind: "EXPENSE", date: monthsAgo(0, 20), description: "Serviços administrativos", category: "Administrativo", amount: 259, source: "manual", status: "CONFIRMED" },
    ],
    team: [
      { id: "member_1", companyId: COMPANY_ID, name: "Mariana Costa", email: "", phone: "", department: "", location: "", type: "HUMAN", role: "Head de Marketing", monthlyCost: 9800, status: "ACTIVE" },
      { id: "member_2", companyId: COMPANY_ID, name: "Lucas Mendes", email: "", phone: "", department: "", location: "", type: "HUMAN", role: "Executivo comercial", monthlyCost: 7400, status: "REVIEW" },
      { id: "agent_1", companyId: COMPANY_ID, name: "CopyMaster Pro", email: "", phone: "", department: "", location: "", type: "AI", role: "Conteúdo e copy", monthlyCost: 620, status: "ACTIVE" },
      { id: "agent_2", companyId: COMPANY_ID, name: "SupportBot", email: "", phone: "", department: "", location: "", type: "AI", role: "Atendimento WhatsApp", monthlyCost: 480, status: "ACTIVE" },
    ],
    teamTasks: [
      { id: "task_1", title: "Revisar campanha de remarketing", details: "Conferir criativos e atualizar os públicos antes da próxima veiculação.", assigneeId: "member_1", dueDate: daysFromToday(1), status: "IN_PROGRESS", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "task_2", title: "Enviar proposta comercial", details: "Preparar o escopo e encaminhar a proposta para o contato.", assigneeId: "member_2", dueDate: daysFromToday(2), status: "TODO", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "task_3", title: "Atualizar apresentação da empresa", details: "Revisar os resultados e incluir os dados do último mês.", assigneeId: "member_2", dueDate: daysFromToday(-1), status: "DONE", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ],
    pipelineStages: defaultPipelineStages(),
    opportunities: [
      { id: "opportunity_1", title: "Plano de mídia trimestral", company: "Studio Cais", contact: "Beatriz Nunes", amount: 6400, ownerId: "member_2", nextStep: "Enviar proposta", dueDate: daysFromToday(2), stageId: "stage-new", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "opportunity_2", title: "Consultoria de crescimento", company: "Clínica Horizonte", contact: "André Lima", amount: 8900, ownerId: "member_2", nextStep: "Agendar apresentação", dueDate: daysFromToday(4), stageId: "stage-contacted", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "opportunity_3", title: "Identidade e campanha", company: "Ateliê Aurora", contact: "Paula Reis", amount: 3200, ownerId: "member_1", nextStep: "Contrato confirmado", dueDate: daysFromToday(0), stageId: "stage-finished", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ],
    meetings: [
      {
        id: "meeting_1",
        companyId: COMPANY_ID,
        title: "Resultados da campanha",
        date: `${monthsAgo(0, today.getDate())}T14:00:00`,
        participants: ["Mariana Costa", "Lucas Mendes"],
        notes: "Revisar remarketing e atualizar apresentação comercial.",
        transcript: "Mariana: Vamos revisar os resultados do mês. Lucas: O remarketing está convertendo melhor que a campanha de topo de funil. Mariana: Então realocamos verba e atualizamos a apresentação.",
        summary: "A campanha de remarketing converte melhor que a de topo de funil. Decisão: realocar verba e atualizar a apresentação comercial.",
        actionItems: [
          { id: "action_1", title: "Atualizar apresentação comercial", owner: "Lucas Mendes", due: monthsAgo(0, Math.min(28, today.getDate() + 2)), done: false },
          { id: "action_2", title: "Realocar verba para remarketing", owner: "Mariana Costa", due: monthsAgo(0, Math.min(28, today.getDate() + 5)), done: false },
        ],
      },
    ],
    events: [
      { id: "event_1", companyId: COMPANY_ID, title: "Daily com equipe", date: todayIso, time: "09:00", durationMinutes: 30, kind: "MEETING", owner: "Rafael Martins", done: false },
      { id: "event_2", companyId: COMPANY_ID, title: "Apresentação Projeto Atlas", date: todayIso, time: "14:00", durationMinutes: 90, kind: "MEETING", owner: "Lucas Mendes", done: false },
      { id: "event_3", companyId: COMPANY_ID, title: "Follow-up Comercial", date: todayIso, time: "16:30", durationMinutes: 30, kind: "TASK", owner: "Mariana Costa", done: false },
      { id: "event_4", companyId: COMPANY_ID, title: "Pagamento de fornecedores", date: monthsAgo(0, Math.min(28, today.getDate() + 1)), time: "10:00", durationMinutes: 60, kind: "PAYMENT", owner: "Rafael Martins", done: false },
      { id: "event_5", companyId: COMPANY_ID, title: "Revisão de metas do trimestre", date: monthsAgo(0, Math.min(28, today.getDate() + 3)), time: "11:00", durationMinutes: 60, kind: "EVENT", owner: "Rafael Martins", done: false },
    ],
    audit: [],
    dismissed: [],
  };
}
