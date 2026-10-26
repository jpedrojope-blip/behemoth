import type { Database, TeamMember, TeamMemberProfile } from "@/lib/types";

function normalizedStageName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function isFinalizedStage(name: string) {
  return ["finalizado", "ganho", "fechado"].includes(normalizedStageName(name));
}

function isFromCurrentMonth(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 7) === new Date().toISOString().slice(0, 7);
}

export function teamMemberProfile(db: Database, member: TeamMember): TeamMemberProfile {
  const tasks = db.teamTasks.filter((task) => task.assigneeId === member.id);
  const completedTasks = tasks.filter((task) => task.status === "DONE").length;
  const nextTask = tasks
    .filter((task) => task.status !== "DONE")
    .sort((first, second) => first.dueDate.localeCompare(second.dueDate))[0] ?? null;
  const finalizedStageIds = new Set(
    db.pipelineStages.filter((stage) => isFinalizedStage(stage.name)).map((stage) => stage.id),
  );
  const finalizedValue = member.type === "HUMAN"
    ? db.opportunities
      .filter((opportunity) => opportunity.ownerId === member.id
        && finalizedStageIds.has(opportunity.stageId)
        && isFromCurrentMonth(opportunity.updatedAt))
      .reduce((total, opportunity) => total + opportunity.amount, 0)
    : 0;

  return {
    id: member.id,
    companyId: member.companyId,
    name: member.name,
    email: member.email ?? "",
    phone: member.phone ?? "",
    department: member.department ?? "",
    location: member.location ?? "",
    locationState: member.locationState ?? "",
    locationCity: member.locationCity ?? "",
    bio: member.bio ?? "",
    startDate: member.startDate ?? "",
    manager: member.manager ?? "",
    employmentType: member.employmentType ?? "",
    skills: member.skills ?? [],
    type: member.type,
    role: member.role,
    monthlyCost: member.monthlyCost ?? 0,
    agentProvider: member.agentProvider ?? "",
    agentModel: member.agentModel ?? "",
    agentPurpose: member.agentPurpose ?? "",
    agentIntegrations: member.agentIntegrations ?? [],
    status: member.status,
    metrics: {
      assignedTasks: tasks.length,
      completedTasks,
      completionRate: tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0,
      finalizedValue,
      roi: member.type === "HUMAN" && member.monthlyCost > 0 ? Math.round((finalizedValue / member.monthlyCost) * 100) : null,
      nextTaskTitle: nextTask?.title ?? null,
      nextTaskDueDate: nextTask?.dueDate ?? null,
    },
  };
}

export function summarizeTeam(db: Database) {
  const profiles = db.team.map((member) => teamMemberProfile(db, member));
  const humans = profiles.filter((member) => member.type === "HUMAN");
  const agents = profiles.filter((member) => member.type === "AI");
  const active = profiles.filter((member) => member.status === "ACTIVE");
  const membersWithTasks = profiles.filter((member) => member.metrics.assignedTasks > 0);
  const monthlyCost = active.reduce((total, member) => total + member.monthlyCost, 0);
  const activeHumans = active.filter((member) => member.type === "HUMAN");
  const humanCost = activeHumans.reduce((total, member) => total + member.monthlyCost, 0);
  const agentCost = active.filter((member) => member.type === "AI").reduce((total, member) => total + member.monthlyCost, 0);
  const finalizedValue = activeHumans.reduce((total, member) => total + member.metrics.finalizedValue, 0);
  const assignedTasks = membersWithTasks.reduce((total, member) => total + member.metrics.assignedTasks, 0);
  const completedTasks = membersWithTasks.reduce((total, member) => total + member.metrics.completedTasks, 0);

  return {
    total: profiles.length,
    humans: humans.length,
    agents: agents.length,
    monthlyCost,
    humanCost,
    agentCost,
    assignedTasks,
    completedTasks,
    averagePerformance: assignedTasks ? Math.round((completedTasks / assignedTasks) * 100) : 0,
    averageRoi: humanCost ? Math.round((finalizedValue / humanCost) * 100) : null,
  };
}
