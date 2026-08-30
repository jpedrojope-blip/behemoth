import { NextResponse } from "next/server";
import { parseBody, resetSchema } from "@/lib/schemas";
import { mutate, recordAudit, resetDatabase } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await parseBody(request, resetSchema);
  if (!parsed.ok) return parsed.response;
  const { mode, keepCompany } = parsed.data;

  if (mode === "demo") {
    const db = resetDatabase();
    return NextResponse.json({ mode, company: db.company });
  }

  return mutate((db) => {
    db.transactions = [];
    db.team = [];
    db.meetings = [];
    db.events = [];
    db.dismissed = [];
    db.audit = [];
    if (!keepCompany) {
      db.company = { ...db.company, name: "Minha empresa", niche: "", plan: "Basic", ownerName: "Você" };
    }
    recordAudit(db, "RESET", "company", db.company.id);
    return NextResponse.json({ mode, company: db.company });
  });
}
