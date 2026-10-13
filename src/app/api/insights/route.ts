import { NextResponse } from "next/server";
import { buildInsights, isPeriod, type Period } from "@/lib/finance";
import { withWorkspaceDatabase } from "@/lib/workspace-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("period");
  const period: Period = isPeriod(requested) ? requested : "mes";
  return withWorkspaceDatabase(request, (db) =>
    NextResponse.json({ period, insights: buildInsights(db.transactions, period) }),
  );
}
