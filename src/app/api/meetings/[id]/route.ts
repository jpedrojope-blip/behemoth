import { NextResponse } from "next/server";
import { meetingUpdateSchema, parseBody } from "@/lib/schemas";
import { createId, mutate, recordAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  return mutate((db) => {
    const meeting = db.meetings.find((item) => item.id === id);
    if (!meeting) return NextResponse.json({ error: "Reunião não encontrada." }, { status: 404 });
    return NextResponse.json({ meeting });
  });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = await parseBody(request, meetingUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const { actionItems, ...rest } = parsed.data;

  return mutate((db) => {
    const meeting = db.meetings.find((item) => item.id === id);
    if (!meeting) return NextResponse.json({ error: "Reunião não encontrada." }, { status: 404 });

    Object.assign(meeting, rest);
    if (actionItems) {
      meeting.actionItems = actionItems.map((item) => ({ ...item, id: item.id || createId("action") }));
    }

    recordAudit(db, "UPDATE", "meeting", meeting.id);
    return NextResponse.json({ meeting });
  });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  return mutate((db) => {
    const index = db.meetings.findIndex((item) => item.id === id);
    if (index === -1) return NextResponse.json({ error: "Reunião não encontrada." }, { status: 404 });
    db.meetings.splice(index, 1);
    recordAudit(db, "DELETE", "meeting", id);
    return NextResponse.json({ ok: true });
  });
}
