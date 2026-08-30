import { NextResponse } from "next/server";
import { permissionsFor } from "@/lib/auth";
import { loginSchema, parseBody } from "@/lib/schemas";
import { getDatabase } from "@/lib/store";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await parseBody(request, loginSchema);
  if (!parsed.ok) return parsed.response;

  const db = getDatabase();
  const role: Role = parsed.data.email.includes("admin") ? "ADMIN" : db.company.ownerRole;

  return NextResponse.json({
    user: { id: "user_current", name: db.company.ownerName, email: parsed.data.email, role, companyId: db.company.id },
    permissions: permissionsFor(role),
    note: "Sessão local de demonstração. Conecte o Supabase Auth para autenticação real.",
  });
}
