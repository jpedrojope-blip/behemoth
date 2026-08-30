import { NextResponse } from "next/server";
import { meetingCreateSchema, parseBody } from "@/lib/schemas";
import { createId, mutate, recordAudit } from "@/lib/store";
import type { Meeting } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return mutate((db) =>
    NextResponse.json({
      meetings: [...db.meetings].sort((a, b) => b.date.localeCompare(a.date)),
      openActionItems: db.meetings.reduce(
        (total, meeting) => total + meeting.actionItems.filter((item) => !item.done).length,
        0,
      ),
      people: db.team.map((member) => member.name),
      calendarAutomation: db.automations.actionItemsToCalendar,
    }),
  );
}

export async function POST(request: Request) {
  const parsed = await parseBody(request, meetingCreateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  return mutate((db) => {
    const meeting: Meeting = {
      id: createId("meeting"),
      companyId: db.company.id,
      title: body.title,
      date: body.date ?? new Date().toISOString(),
      participants: body.participants,
      notes: body.notes,
      transcript: body.transcript,
      summary: "",
      actionItems: [],
    };
    db.meetings.push(meeting);
    recordAudit(db, "CREATE", "meeting", meeting.id);
    return NextResponse.json({ meeting }, { status: 201 });
  });
}
