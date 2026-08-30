import { NextResponse } from "next/server";
import { integrationStatus } from "@/lib/auth";
import { getDatabase, isPersistent } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDatabase();
  return NextResponse.json({
    status: "ok",
    storage: isPersistent() ? "arquivo local (.data/behemoth.json)" : "memória (sistema de arquivos somente leitura)",
    persistent: isPersistent(),
    records: {
      transactions: db.transactions.length,
      team: db.team.length,
      meetings: db.meetings.length,
      events: db.events.length,
    },
    integrations: integrationStatus(),
    checkedAt: new Date().toISOString(),
  });
}
