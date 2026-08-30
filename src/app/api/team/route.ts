import { NextResponse } from "next/server";
import { parseBody, teamCreateSchema } from "@/lib/schemas";
import { createId, mutate, recordAudit } from "@/lib/store";
import type { TeamMember } from "@/lib/types";

export const dynamic = "force-dynamic";

function summarize(team: TeamMember[]) {
  const humans = team.filter((member) => member.type === "HUMAN");
  const agents = team.filter((member) => member.type === "AI");
  const active = team.filter((member) => member.status === "ACTIVE");
  return {
    total: team.length,
    humans: humans.length,
    agents: agents.length,
    monthlyCost: active.reduce((total, member) => total + member.monthlyCost, 0),
    humanCost: humans.reduce((total, member) => total + member.monthlyCost, 0),
    agentCost: agents.reduce((total, member) => total + member.monthlyCost, 0),
    averagePerformance: team.length
      ? Math.round(team.reduce((total, member) => total + member.performance, 0) / team.length)
      : 0,
    averageRoi: team.length ? Math.round(team.reduce((total, member) => total + member.roi, 0) / team.length) : 0,
    onTarget: team.filter((member) => member.performance >= member.target).length,
  };
}

export async function GET() {
  return mutate((db) =>
    NextResponse.json({
      team: db.team,
      summary: summarize(db.team),
      costAutomation: db.automations.teamCostToExpenses,
    }),
  );
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, teamCreateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  return mutate((db) => {
    const member: TeamMember = {
      id: createId(body.type === "AI" ? "agent" : "member"),
      companyId: db.company.id,
      ...body,
    };
    db.team.push(member);
    recordAudit(db, "CREATE", "team_member", member.id);
    return NextResponse.json({ member, summary: summarize(db.team) }, { status: 201 });
  });
}
