const B = process.env.BASE_URL ?? "http://localhost:3000";
const call = async (path, method = "GET", body) => {
  const r = await fetch(B + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
};

const ok = (label, cond, extra = "") => console.log(`${cond ? "OK  " : "FALHA"} ${label}${extra ? " :: " + extra : ""}`);

// Linha de base: o teste roda sobre o workspace atual, seja ele qual for.
const baseFin = await call("/api/transactions?period=mes");
const baseTeamExpense = baseFin.transactions.find((t) => t.category === "Equipe")?.amount ?? 0;
const baseOpenActions = (await call("/api/meetings")).openActionItems;

// 1. equipe -> despesa automática
await call("/api/team", "POST", { name: "Ana Souza", role: "Growth", type: "HUMAN", monthlyCost: 5000, performance: 90, target: 85, roi: 140 });
await call("/api/team", "POST", { name: "AtendeBot", role: "Suporte", type: "AI", monthlyCost: 500, performance: 88, target: 90, roi: 200 });
let fin = await call("/api/transactions?period=mes");
const teamExpense = fin.transactions.find((t) => t.category === "Equipe");
ok("custo da equipe virou despesa", teamExpense?.amount === baseTeamExpense + 5500, `valor=${teamExpense?.amount} (base ${baseTeamExpense})`);

// custo muda -> despesa acompanha
const team = await call("/api/team");
const ana = team.team.find((m) => m.name === "Ana Souza");
await call(`/api/team/${ana.id}`, "PATCH", { monthlyCost: 6000 });
fin = await call("/api/transactions?period=mes");
ok("despesa acompanha mudança de custo", fin.transactions.find((t) => t.category === "Equipe")?.amount === baseTeamExpense + 6500);

// 2. reunião -> evento no calendário
const { meeting } = await call("/api/meetings", "POST", { title: "Planejamento trimestral", date: new Date().toISOString() });
let cal = await call("/api/events");
ok("reunião apareceu no calendário", cal.events.some((e) => e.id === `auto_meeting_${meeting.id}`));

// 3. item de ação com prazo -> tarefa no calendário
const due = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
const updated = await call(`/api/meetings/${meeting.id}`, "PATCH", {
  actionItems: [{ title: "Fechar orçamento do trimestre", owner: "Ana Souza", due, done: false }],
});
const actionId = updated.meeting.actionItems[0].id;
cal = await call("/api/events");
const taskEvent = cal.events.find((e) => e.id === `auto_action_${actionId}`);
ok("item de ação virou tarefa na agenda", Boolean(taskEvent), `data=${taskEvent?.date}`);

// concluir no calendário conclui na reunião
await call(`/api/events/${taskEvent.id}`, "PATCH", { done: true });
const meetings = await call("/api/meetings");
const item = meetings.meetings.find((m) => m.id === meeting.id).actionItems[0];
ok("concluir tarefa fecha o item de ação", item.done === true);
ok("contador de itens em aberto voltou à base", meetings.openActionItems === baseOpenActions);

// 4. pagamento concluído -> despesa
const { event } = await call("/api/events", "POST", { title: "Aluguel do escritório", date: new Date().toISOString().slice(0, 10), kind: "PAYMENT", amount: 3200 });
fin = await call("/api/transactions?period=mes");
ok("pagamento pendente NÃO gera despesa", !fin.transactions.some((t) => t.id === `auto_event_${event.id}`));
await call(`/api/events/${event.id}`, "PATCH", { done: true });
fin = await call("/api/transactions?period=mes");
ok("pagamento concluído gera despesa", fin.transactions.some((t) => t.id === `auto_event_${event.id}`));
await call(`/api/events/${event.id}`, "PATCH", { done: false });
fin = await call("/api/transactions?period=mes");
ok("desmarcar pagamento remove a despesa", !fin.transactions.some((t) => t.id === `auto_event_${event.id}`));

// 5. recorrência mensal
const past = new Date();
past.setMonth(past.getMonth() - 3);
const dateStr = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, "0")}-05`;
const { transaction } = await call("/api/transactions", "POST", { description: "Contrato guarda-chuva", amount: 8000, kind: "INCOME", category: "Recorrente", date: dateStr, recurrence: "MONTHLY" });
const all = await call("/api/transactions?period=trimestre");
const copies = all.transactions.filter((t) => t.originId === transaction.id);
ok("recorrência gerou os meses seguintes", copies.length === 3, `cópias=${copies.length}`);

// idempotência: rodar de novo não duplica
await call("/api/transactions?period=trimestre");
const again = await call("/api/transactions?period=trimestre");
ok("rodar de novo não duplica", again.transactions.filter((t) => t.originId === transaction.id).length === 3);

// item automático apagado não volta
const target = copies[0];
await call(`/api/transactions/${target.id}`, "DELETE");
const afterDelete = await call("/api/transactions?period=trimestre");
ok("cópia apagada não é recriada", !afterDelete.transactions.some((t) => t.id === target.id));

// lançamento automático é protegido contra edição manual
const r = await fetch(`${B}/api/transactions/${teamExpense.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: 1 }) });
ok("lançamento automático bloqueia edição manual", r.status === 409);

// validação zod
const bad = await fetch(`${B}/api/transactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: "", amount: -5, kind: "OUTRO" }) });
const badJson = await bad.json();
ok("validação rejeita corpo inválido", bad.status === 400, badJson.error);

// Limpeza: remove tudo que este teste criou.
for (const member of (await call("/api/team")).team.filter((m) => ["Ana Souza", "AtendeBot"].includes(m.name))) {
  await call(`/api/team/${member.id}`, "DELETE");
}
await call(`/api/meetings/${meeting.id}`, "DELETE");
await call(`/api/events/${event.id}`, "DELETE");
await call(`/api/transactions/${transaction.id}`, "DELETE");
console.log("workspace restaurado ao estado anterior ao teste");
