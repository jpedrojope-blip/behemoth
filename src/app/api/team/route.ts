import { NextResponse } from "next/server";
import { BRAZILIAN_STATE_CAPITALS, isBrazilianStateCode } from "@/lib/locations";
import { parseBody, teamCreateSchema } from "@/lib/schemas";
import { createId, recordAudit } from "@/lib/store";
import { summarizeTeam, teamMemberProfile } from "@/lib/team-metrics";
import { withWorkspaceDatabase } from "@/lib/workspace-store";
import type { TeamMember } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withWorkspaceDatabase(request, (db) =>
    NextResponse.json({
      team: db.team.map((member) => teamMemberProfile(db, member)),
      summary: summarizeTeam(db),
      costAutomation: db.automations.teamCostToExpenses,
    }),
  );
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, teamCreateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (!validLocation(body.locationState, body.locationCity)) {
    return NextResponse.json({ error: "Selecione a capital correspondente ao estado." }, { status: 400 });
  }

  return withWorkspaceDatabase(request, (db) => {
    const member: TeamMember = {
      id: createId(body.type === "AI" ? "agent" : "member"),
      companyId: db.company.id,
      ...body,
    };
    db.team.push(member);
    recordAudit(db, "CREATE", "team_member", member.id);
    return NextResponse.json({ member: teamMemberProfile(db, member), summary: summarizeTeam(db) }, { status: 201 });
  });
}

function validLocation(state: string, city: string) {
  if (!state && !city) return true;
  return isBrazilianStateCode(state) && BRAZILIAN_STATE_CAPITALS[state] === city;
}
