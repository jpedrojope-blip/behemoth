import { NextResponse } from "next/server";
import { parseBody, teamUpdateSchema } from "@/lib/schemas";
import { mutate, recordAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = await parseBody(request, teamUpdateSchema);
  if (!parsed.ok) return parsed.response;

  return mutate((db) => {
    const member = db.team.find((item) => item.id === id);
    if (!member) return NextResponse.json({ error: "Integrante não encontrado." }, { status: 404 });

    Object.assign(member, parsed.data);
    recordAudit(db, "UPDATE", "team_member", member.id);
    return NextResponse.json({ member });
  });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  return mutate((db) => {
    const index = db.team.findIndex((item) => item.id === id);
    if (index === -1) return NextResponse.json({ error: "Integrante não encontrado." }, { status: 404 });
    db.team.splice(index, 1);
    recordAudit(db, "DELETE", "team_member", id);
    return NextResponse.json({ ok: true });
  });
}
