import { NextResponse } from "next/server";
import { integrationStatus, permissionsFor } from "@/lib/auth";
import { parseBody, settingsUpdateSchema } from "@/lib/schemas";
import { isPersistent, mutate, recordAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return mutate((db) =>
    NextResponse.json({
      company: db.company,
      automations: db.automations,
      permissions: permissionsFor(db.company.ownerRole),
      integrations: integrationStatus(),
      persistent: isPersistent(),
      counts: {
        transactions: db.transactions.length,
        automatedTransactions: db.transactions.filter((transaction) => transaction.auto).length,
        team: db.team.length,
        meetings: db.meetings.length,
        events: db.events.length,
        automatedEvents: db.events.filter((event) => event.auto).length,
      },
      audit: db.audit.slice(0, 20),
    }),
  );
}

export async function PATCH(request: Request) {
  const parsed = await parseBody(request, settingsUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const { automations, ...company } = parsed.data;

  return mutate((db) => {
    Object.assign(db.company, company);
    if (automations) Object.assign(db.automations, automations);
    recordAudit(db, "UPDATE", "company", db.company.id);
    return NextResponse.json({ company: db.company, automations: db.automations });
  });
}
