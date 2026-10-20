import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/schemas";
import { createId, recordAudit } from "@/lib/store";
import { withWorkspaceDatabase } from "@/lib/workspace-store";
import type { Database, PipelineStage, SalesOpportunity, TeamTask } from "@/lib/types";

export const dynamic = "force-dynamic";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.");
const taskStatus = z.enum(["TODO", "IN_PROGRESS", "DONE"]);
const stageTone = z.enum(["blue", "violet", "amber", "green", "rose"]);

const taskFields = {
  title: z.string().trim().min(1, "Informe o título da tarefa.").max(120),
  details: z.string().trim().max(500).default(""),
  assigneeId: z.string().nullable().default(null),
  dueDate: isoDate,
  status: taskStatus.default("TODO"),
};

const opportunityFields = {
  title: z.string().trim().min(1, "Informe o nome do negócio.").max(120),
  company: z.string().trim().max(120).default(""),
  contact: z.string().trim().max(120).default(""),
  amount: z.number().min(0).default(0),
  ownerId: z.string().nullable().default(null),
  nextStep: z.string().trim().max(240).default(""),
  dueDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/, "Data inválida.").default(""),
  stageId: z.string().min(1),
};

const createSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createTask"), data: z.object(taskFields) }),
  z.object({ action: z.literal("createOpportunity"), data: z.object(opportunityFields) }),
  z.object({
    action: z.literal("createStage"),
    data: z.object({ name: z.string().trim().min(1, "Informe o nome da etapa.").max(48), tone: stageTone }),
  }),
]);

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("updateTask"),
    id: z.string().min(1),
    data: z.object({
      title: taskFields.title.optional(),
      details: taskFields.details.optional(),
      assigneeId: taskFields.assigneeId.optional(),
      dueDate: taskFields.dueDate.optional(),
      status: taskStatus.optional(),
    }).refine((data) => Object.keys(data).length > 0, "Informe o que deseja alterar."),
  }),
  z.object({
    action: z.literal("updateOpportunity"),
    id: z.string().min(1),
    data: z.object({
      title: opportunityFields.title.optional(),
      company: opportunityFields.company.optional(),
      contact: opportunityFields.contact.optional(),
      amount: opportunityFields.amount.optional(),
      ownerId: opportunityFields.ownerId.optional(),
      nextStep: opportunityFields.nextStep.optional(),
      dueDate: opportunityFields.dueDate.optional(),
      stageId: opportunityFields.stageId.optional(),
    }).refine((data) => Object.keys(data).length > 0, "Informe o que deseja alterar."),
  }),
]);

const deleteSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("task"), id: z.string().min(1) }),
  z.object({ entity: z.literal("opportunity"), id: z.string().min(1) }),
  z.object({ entity: z.literal("stage"), id: z.string().min(1), moveToStageId: z.string().min(1) }),
]);

function failure(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function validHuman(db: Database, memberId: string | null) {
  return !memberId || db.team.some((member) => member.id === memberId && member.type === "HUMAN");
}

export async function GET(request: Request) {
  return withWorkspaceDatabase(request, (db) => NextResponse.json({
    tasks: db.teamTasks,
    stages: db.pipelineStages,
    opportunities: db.opportunities,
  }));
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;

  return withWorkspaceDatabase(request, (db) => {
    const now = new Date().toISOString();
    const input = parsed.data;

    if (input.action === "createTask") {
      if (!validHuman(db, input.data.assigneeId)) return failure("Selecione um funcionário válido da equipe.", 400);
      const task: TeamTask = { id: createId("task"), ...input.data, createdAt: now, updatedAt: now };
      db.teamTasks.unshift(task);
      recordAudit(db, "CREATE", "team_task", task.id);
      return NextResponse.json({ task }, { status: 201 });
    }

    if (input.action === "createOpportunity") {
      if (!db.pipelineStages.some((stage) => stage.id === input.data.stageId)) return failure("Selecione uma etapa válida.", 400);
      if (!validHuman(db, input.data.ownerId)) return failure("Selecione um responsável válido da equipe.", 400);
      const opportunity: SalesOpportunity = { id: createId("opportunity"), ...input.data, createdAt: now, updatedAt: now };
      db.opportunities.unshift(opportunity);
      recordAudit(db, "CREATE", "sales_opportunity", opportunity.id);
      return NextResponse.json({ opportunity }, { status: 201 });
    }

    if (db.pipelineStages.some((stage) => stage.name.toLocaleLowerCase() === input.data.name.toLocaleLowerCase())) {
      return failure("Já existe uma etapa com esse nome.", 409);
    }
    const stage: PipelineStage = { id: createId("stage"), ...input.data };
    db.pipelineStages.push(stage);
    recordAudit(db, "CREATE", "pipeline_stage", stage.id);
    return NextResponse.json({ stage }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  const parsed = await parseBody(request, patchSchema);
  if (!parsed.ok) return parsed.response;

  return withWorkspaceDatabase(request, (db) => {
    const input = parsed.data;
    if (input.action === "updateTask") {
      const task = db.teamTasks.find((entry) => entry.id === input.id);
      if (!task) return failure("Tarefa não encontrada.", 404);
      if (input.data.assigneeId !== undefined && !validHuman(db, input.data.assigneeId)) {
        return failure("Selecione um funcionário válido da equipe.", 400);
      }
      Object.assign(task, input.data, { updatedAt: new Date().toISOString() });
      recordAudit(db, "UPDATE", "team_task", task.id);
      return NextResponse.json({ task });
    }

    const opportunity = db.opportunities.find((entry) => entry.id === input.id);
    if (!opportunity) return failure("Negócio não encontrado.", 404);
    if (input.data.stageId && !db.pipelineStages.some((stage) => stage.id === input.data.stageId)) {
      return failure("Selecione uma etapa válida.", 400);
    }
    if (input.data.ownerId !== undefined && !validHuman(db, input.data.ownerId)) {
      return failure("Selecione um responsável válido da equipe.", 400);
    }
    Object.assign(opportunity, input.data, { updatedAt: new Date().toISOString() });
    recordAudit(db, "UPDATE", "sales_opportunity", opportunity.id);
    return NextResponse.json({ opportunity });
  });
}

export async function DELETE(request: Request) {
  const parsed = await parseBody(request, deleteSchema);
  if (!parsed.ok) return parsed.response;

  return withWorkspaceDatabase(request, (db) => {
    const input = parsed.data;
    if (input.entity === "task") {
      const exists = db.teamTasks.some((task) => task.id === input.id);
      if (!exists) return failure("Tarefa não encontrada.", 404);
      db.teamTasks = db.teamTasks.filter((task) => task.id !== input.id);
      recordAudit(db, "DELETE", "team_task", input.id);
      return NextResponse.json({ ok: true });
    }
    if (input.entity === "opportunity") {
      const exists = db.opportunities.some((opportunity) => opportunity.id === input.id);
      if (!exists) return failure("Negócio não encontrado.", 404);
      db.opportunities = db.opportunities.filter((opportunity) => opportunity.id !== input.id);
      recordAudit(db, "DELETE", "sales_opportunity", input.id);
      return NextResponse.json({ ok: true });
    }

    if (db.pipelineStages.length <= 1) return failure("O pipeline precisa manter ao menos uma etapa.", 409);
    const stage = db.pipelineStages.find((entry) => entry.id === input.id);
    const destination = db.pipelineStages.find((entry) => entry.id === input.moveToStageId);
    if (!stage) return failure("Etapa não encontrada.", 404);
    if (!destination || destination.id === stage.id) return failure("Escolha outra etapa para receber os negócios.", 400);
    db.opportunities = db.opportunities.map((opportunity) =>
      opportunity.stageId === stage.id ? { ...opportunity, stageId: destination.id, updatedAt: new Date().toISOString() } : opportunity,
    );
    db.pipelineStages = db.pipelineStages.filter((entry) => entry.id !== stage.id);
    recordAudit(db, "DELETE", "pipeline_stage", stage.id);
    return NextResponse.json({ ok: true });
  });
}
