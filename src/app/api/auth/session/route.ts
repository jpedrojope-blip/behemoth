import { NextResponse } from "next/server";
import { profileFromUser, userFromRequest } from "@/lib/supabase-auth";

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  return NextResponse.json({ authenticated: Boolean(user), user: user ? profileFromUser(user) : null }, { status: user ? 200 : 401 });
}
