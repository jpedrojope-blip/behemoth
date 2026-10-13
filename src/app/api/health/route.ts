import { NextResponse } from "next/server";
import { integrationStatus } from "@/lib/auth";
import { workspaceStorageIsConfigured } from "@/lib/workspace-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    storage: workspaceStorageIsConfigured() ? "workspace isolado" : "armazenamento não configurado",
    persistent: workspaceStorageIsConfigured(),
    integrations: integrationStatus(),
    checkedAt: new Date().toISOString(),
  });
}
