import { NextResponse } from "next/server";
import { parseBody, resetSchema } from "@/lib/schemas";
import { withWorkspaceDatabase, resetWorkspaceData, resetWorkspaceDemo } from "@/lib/workspace-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await parseBody(request, resetSchema);
  if (!parsed.ok) return parsed.response;
  const { mode, keepCompany } = parsed.data;

  return withWorkspaceDatabase(request, (db) => {
    if (mode === "demo") resetWorkspaceDemo(db);
    else resetWorkspaceData(db, keepCompany);
    return NextResponse.json({ mode, company: db.company });
  });
}
