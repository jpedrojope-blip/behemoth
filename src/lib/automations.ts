import { DEFAULT_AUTOMATIONS, type CalendarEvent, type Database, type Transaction } from "@/lib/types";

/**
 * Regras que ligam os módulos entre si.
 *
 * Tudo aqui é idempotente: cada item gerado tem um id determinístico, então rodar
 * a rotina mil vezes produz o mesmo resultado. O que o usuário apaga entra em
 * `db.dismissed` e nunca volta.
 */
export function runAutomations(db: Database, reference = new Date()): string[] {
  const applied: string[] = [];
  db.dismissed ??= [];
  const rules = db.automations ?? DEFAULT_AUTOMATIONS;

  if (rules.recurringTransactions) applied.push(...expandRecurring(db, reference));
  if (rules.teamCostToExpenses) applied.push(...syncTeamCost(db, reference));
  if (rules.actionItemsToCalendar) applied.push(...syncActionItems(db));
  if (rules.meetingsToCalendar) applied.push(...syncMeetings(db));
  if (rules.paymentsToExpenses) applied.push(...syncPayments(db));

  cleanupOrphans(db);
  return applied;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dismissed(db: Database, id: string) {
  return db.dismissed.includes(id);
}

/** Lançamentos mensais recorrentes: materializa as ocorrências até o mês atual. */
function expandRecurring(db: Database, reference: Date): string[] {
  const applied: string[] = [];
  const templates = db.transactions.filter(
    (transaction) => transaction.recurrence === "MONTHLY" && !transaction.originId,
  );

  for (const template of templates) {
    const [year, month, day] = template.date.slice(0, 10).split("-").map(Number);
    const start = new Date(year, month - 1, 1);
    const cursor = new Date(start.getFullYear(), start.getMonth() + 1, 1);

    while (cursor <= reference) {
      const key = monthKey(cursor);
      const id = `${template.id}__${key}`;
      const exists = db.transactions.some((transaction) => transaction.id === id);

      if (!exists && !dismissed(db, id)) {
        const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
        db.transactions.push({
          ...template,
          id,
          date: `${key}-${String(Math.min(day, lastDay)).padStart(2, "0")}`,
          recurrence: "MONTHLY",
          originId: template.id,
          source: "recorrência",
          auto: true,
        });
        applied.push(id);
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return applied;
}

/** Custo da equipe vira uma despesa do mês corrente, sempre atualizada. */
function syncTeamCost(db: Database, reference: Date): string[] {
  const key = monthKey(reference);
  const id = `auto_team_${key}`;
  if (dismissed(db, id)) return [];

  const total = db.team
    .filter((member) => member.status === "ACTIVE")
    .reduce((sum, member) => sum + member.monthlyCost, 0);
  const index = db.transactions.findIndex((transaction) => transaction.id === id);

  if (total <= 0) {
    if (index >= 0) db.transactions.splice(index, 1);
    return [];
  }

  const lastDay = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
  const entry: Transaction = {
    id,
    companyId: db.company.id,
    kind: "EXPENSE",
    date: `${key}-${String(Math.min(reference.getDate(), lastDay)).padStart(2, "0")}`,
    description: "Custo da equipe e agentes",
    category: "Equipe",
    amount: total,
    source: "automação",
    status: "CONFIRMED",
    auto: true,
  };

  if (index >= 0) {
    if (db.transactions[index].amount === total) return [];
    db.transactions[index] = { ...db.transactions[index], amount: total, date: entry.date };
    return [id];
  }

  db.transactions.push(entry);
  return [id];
}

/** Cada item de ação com prazo vira uma tarefa no calendário. */
function syncActionItems(db: Database): string[] {
  const applied: string[] = [];

  for (const meeting of db.meetings) {
    for (const item of meeting.actionItems) {
      if (!item.due) continue;
      const id = `auto_action_${item.id}`;
      if (dismissed(db, id)) continue;

      const existing = db.events.find((event) => event.id === id);
      if (!existing) {
        db.events.push({
          id,
          companyId: db.company.id,
          title: item.title,
          date: item.due.slice(0, 10),
          time: "09:00",
          durationMinutes: 30,
          kind: "TASK",
          owner: item.owner || db.company.ownerName,
          done: item.done,
          auto: true,
          linkedMeetingId: meeting.id,
          linkedActionItemId: item.id,
        });
        applied.push(id);
        continue;
      }

      // Concluir de um lado conclui do outro: vence a mudança mais recente.
      if (existing.done !== item.done) {
        item.done = existing.done;
        applied.push(id);
      }
      if (existing.title !== item.title || existing.date !== item.due.slice(0, 10)) {
        existing.title = item.title;
        existing.date = item.due.slice(0, 10);
        applied.push(id);
      }
    }
  }
  return applied;
}

/** Toda reunião agendada aparece no calendário. */
function syncMeetings(db: Database): string[] {
  const applied: string[] = [];

  for (const meeting of db.meetings) {
    const id = `auto_meeting_${meeting.id}`;
    if (dismissed(db, id)) continue;

    const date = meeting.date.slice(0, 10);
    const time = meeting.date.slice(11, 16) || "09:00";
    const existing = db.events.find((event) => event.id === id);

    if (!existing) {
      db.events.push({
        id,
        companyId: db.company.id,
        title: meeting.title,
        date,
        time,
        durationMinutes: 60,
        kind: "MEETING",
        owner: meeting.participants[0] ?? db.company.ownerName,
        done: false,
        auto: true,
        linkedMeetingId: meeting.id,
      });
      applied.push(id);
    } else if (existing.title !== meeting.title || existing.date !== date || existing.time !== time) {
      existing.title = meeting.title;
      existing.date = date;
      existing.time = time;
      applied.push(id);
    }
  }
  return applied;
}

/** Pagamento agendado com valor vira despesa quando concluído. */
function syncPayments(db: Database): string[] {
  const applied: string[] = [];

  for (const event of db.events) {
    if (event.kind !== "PAYMENT" || !event.amount || event.amount <= 0) continue;
    const id = `auto_event_${event.id}`;
    if (dismissed(db, id)) continue;

    const index = db.transactions.findIndex((transaction) => transaction.id === id);

    if (event.done && index === -1) {
      db.transactions.push({
        id,
        companyId: db.company.id,
        kind: "EXPENSE",
        date: event.date,
        description: event.title,
        category: "Pagamentos",
        amount: event.amount,
        source: "automação",
        status: "CONFIRMED",
        auto: true,
      });
      applied.push(id);
    } else if (!event.done && index >= 0) {
      db.transactions.splice(index, 1);
      applied.push(id);
    }
  }
  return applied;
}

/** Remove itens automáticos cuja origem deixou de existir. */
function cleanupOrphans(db: Database) {
  const meetingIds = new Set(db.meetings.map((meeting) => meeting.id));
  const actionIds = new Set(db.meetings.flatMap((meeting) => meeting.actionItems.map((item) => item.id)));
  const eventIds = new Set(db.events.map((event) => event.id));
  const templateIds = new Set(db.transactions.filter((transaction) => !transaction.originId).map((t) => t.id));

  db.events = db.events.filter((event: CalendarEvent) => {
    if (!event.auto) return true;
    if (event.linkedActionItemId) return actionIds.has(event.linkedActionItemId);
    if (event.linkedMeetingId) return meetingIds.has(event.linkedMeetingId);
    return true;
  });

  db.transactions = db.transactions.filter((transaction) => {
    if (transaction.originId) return templateIds.has(transaction.originId);
    if (transaction.id.startsWith("auto_event_")) {
      return eventIds.has(transaction.id.replace("auto_event_", ""));
    }
    return true;
  });
}
