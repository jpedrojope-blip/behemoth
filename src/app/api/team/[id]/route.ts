import { NextResponse } from "next/server";
import { BRAZILIAN_STATE_CAPITALS, isBrazilianStateCode } from "@/lib/locations";
import { parseBody, teamUpdateSchema } from "@/lib/schemas";
import { recordAudit } from "@/lib/store";
import { teamMemberProfile } from "@/lib/team-metrics";
import { withWorkspaceDatabase } from "@/lib/workspace-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return withWorkspaceDatabase(request, (db) => {
    const member = db.team.find((item) => item.id === id);
    if (!member) return NextResponse.json({ error: "Integrante não encontrado." }, { status: 404 });
    return NextResponse.json(teamMemberProfile(db, member));
  });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = await parseBody(request, teamUpdateSchema);
  if (!parsed.ok) return parsed.response;

  return withWorkspaceDatabase(request, (db) => {
    const member = db.team.find((item) => item.id === id);
    if (!member) return NextResponse.json({ error: "Integrante não encontrado." }, { status: 404 });

    const locationState = parsed.data.locationState ?? member.locationState ?? "";
    const locationCity = parsed.data.locationCity ?? member.locationCity ?? "";
    if (!validLocation(locationState, locationCity)) {
      return NextResponse.json({ error: "Selecione a capital correspondente ao estado." }, { status: 400 });
    }

    Object.assign(member, parsed.data);
    recordAudit(db, "UPDATE", "team_member", member.id);
    return NextResponse.json({ member: teamMemberProfile(db, member) });
  });
}

function validLocation(state: string, city: string) {
  if (!state && !city) return true;
  return isBrazilianStateCode(state) && BRAZILIAN_STATE_CAPITALS[state] === city;
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return withWorkspaceDatabase(request, (db) => {
    const index = db.team.findIndex((item) => item.id === id);
    if (index === -1) return NextResponse.json({ error: "Integrante não encontrado." }, { status: 404 });
    db.team.splice(index, 1);
    recordAudit(db, "DELETE", "team_member", id);
    return NextResponse.json({ ok: true });
  });
}
