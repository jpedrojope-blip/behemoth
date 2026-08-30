import { NextResponse } from "next/server";
import { mutate, recordAudit } from "@/lib/store";
import { summarizeMeeting } from "@/lib/summarize";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;

  return mutate((db) => {
    const meeting = db.meetings.find((item) => item.id === id);
    if (!meeting) return NextResponse.json({ error: "Reunião não encontrada." }, { status: 404 });

    const result = summarizeMeeting(meeting.notes, meeting.transcript);
    if (!result.summary) {
      return NextResponse.json(
        { error: "Escreva notas ou cole a transcrição antes de gerar o resumo." },
        { status: 400 },
      );
    }

    meeting.summary = result.summary;
    recordAudit(db, "SUMMARIZE", "meeting", meeting.id);

    return NextResponse.json({
      meeting,
      suggestedActionItems: result.actionItems,
      provider: process.env.AI_PROVIDER ?? "mock",
      generatedBy: result.generatedBy,
    });
  });
}
