import { NextResponse } from "next/server";
import { eventUpdateSchema, parseBody } from "@/lib/schemas";
import { dismiss, mutate, recordAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = await parseBody(request, eventUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  return mutate((db) => {
    const event = db.events.find((item) => item.id === id);
    if (!event) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });

    // Concluir a tarefa aqui conclui o item de ação da reunião de origem.
    if (body.done !== undefined && event.linkedActionItemId) {
      for (const meeting of db.meetings) {
        const item = meeting.actionItems.find((entry) => entry.id === event.linkedActionItemId);
        if (item) item.done = body.done;
      }
    }

    Object.assign(event, body);
    recordAudit(db, "UPDATE", "event", event.id);
    return NextResponse.json({ event });
  });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  return mutate((db) => {
    const index = db.events.findIndex((item) => item.id === id);
    if (index === -1) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });

    const [removed] = db.events.splice(index, 1);
    if (removed.auto) dismiss(db, removed.id);
    recordAudit(db, "DELETE", "event", id);
    return NextResponse.json({ ok: true });
  });
}
