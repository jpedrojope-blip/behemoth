import { NextResponse } from "next/server";
import { loginSchema, parseBody } from "@/lib/schemas";
import { authenticateUser, createLocalSessionToken } from "@/lib/auth-store";
import { profileFromUser, signIn, sessionCookieValue, SupabaseUnavailableError, usesLocalDemoAuth } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await parseBody(request, loginSchema);
  if (!parsed.ok) return parsed.response;

  if (usesLocalDemoAuth()) {
    const user = authenticateUser(parsed.data.email, parsed.data.password);
    if (!user) return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
    const response = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
    response.cookies.set("behemoth_session", sessionCookieValue(createLocalSessionToken(user.id), "local"), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return response;
  }

  let data;
  try { data = await signIn(parsed.data.email, parsed.data.password); }
  catch (error) {
    if (error instanceof SupabaseUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  const response = NextResponse.json({ user: profileFromUser(data.user) });
  response.cookies.set("behemoth_session", sessionCookieValue(data.session.access_token, data.session.refresh_token), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return response;
}
