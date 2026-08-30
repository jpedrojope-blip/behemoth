import { NextResponse } from "next/server";
import { eventCreateSchema, parseBody } from "@/lib/schemas";
import { createId, mutate, recordAudit } from "@/lib/store";
import type { CalendarEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const month = url.searchParams.get("month"); // formato YYYY-MM

  return mutate((db) => {
    const events = month ? db.events.filter((event) => event.date.slice(0, 7) === month) : db.events;
    const today = new Date().toISOString().slice(0, 10);
    return NextResponse.json({
      events: [...events].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
      today,
      people: db.team.map((member) => member.name),
      summary: {
        total: events.length,
        pending: events.filter((event) => !event.done).length,
        today: db.events.filter((event) => event.date === today).length,
        late: db.events.filter((event) => !event.done && event.date < today).length,
        automated: events.filter((event) => event.auto).length,
      },
    });
  });
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, eventCreateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  return mutate((db) => {
    const event: CalendarEvent = {
      id: createId("event"),
      companyId: db.company.id,
      title: body.title,
      date: body.date,
      time: body.time,
      durationMinutes: body.durationMinutes,
      kind: body.kind,
      owner: body.owner || db.company.ownerName,
      amount: body.kind === "PAYMENT" ? body.amount : undefined,
      done: false,
    };
    db.events.push(event);
    recordAudit(db, "CREATE", "event", event.id);
    return NextResponse.json({ event }, { status: 201 });
  });
}
