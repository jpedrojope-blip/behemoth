import { NextResponse } from "next/server";
import { eventCreateSchema, parseBody } from "@/lib/schemas";
import { createId, recordAudit } from "@/lib/store";
import { withWorkspaceDatabase } from "@/lib/workspace-store";
import type { CalendarEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const month = url.searchParams.get("month"); // formato YYYY-MM
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const hasValidRange = Boolean(start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && start <= end);

  return withWorkspaceDatabase(request, (db) => {
    const events = hasValidRange
      ? db.events.filter((event) => event.date >= start! && event.date <= end!)
      : month ? db.events.filter((event) => event.date.slice(0, 7) === month) : db.events;
    const monthEvents = month ? db.events.filter((event) => event.date.slice(0, 7) === month) : events;
    const today = new Date().toISOString().slice(0, 10);
    return NextResponse.json({
      events: [...events].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
      today,
      people: db.team.map((member) => member.name),
      summary: {
        total: monthEvents.length,
        pending: monthEvents.filter((event) => !event.done).length,
        today: db.events.filter((event) => event.date === today).length,
        late: db.events.filter((event) => !event.done && event.date < today).length,
        automated: monthEvents.filter((event) => event.auto).length,
      },
    });
  });
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, eventCreateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  return withWorkspaceDatabase(request, (db) => {
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
