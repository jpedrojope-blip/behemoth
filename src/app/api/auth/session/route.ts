import { NextResponse } from "next/server";
import { getUserFromAccessToken, parseSessionCookie } from "@/lib/supabase-auth";

export async function GET(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const raw = cookie.match(/(?:^|;\s*)behemoth_session=([^;]+)/)?.[1];
  const session = raw ? parseSessionCookie(decodeURIComponent(raw)) : null;
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  const user = await getUserFromAccessToken(session.accessToken);
  const name = user ? ("user_metadata" in user ? user.user_metadata.name : user.name) : null;
  return NextResponse.json({ authenticated: Boolean(user), user: user ? { id: user.id, email: user.email, name } : null }, { status: user ? 200 : 401 });
}
