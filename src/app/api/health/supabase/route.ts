import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw error;
    return NextResponse.json({ connected: true, usersAvailable: data.users.length });
  } catch (error) {
    return NextResponse.json({ connected: false, error: error instanceof Error ? error.message : "Falha na conexão." }, { status: 503 });
  }
}
