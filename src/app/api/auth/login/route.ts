import { NextResponse } from "next/server";
import { loginSchema, parseBody } from "@/lib/schemas";
import { signIn, sessionCookieValue } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await parseBody(request, loginSchema);
  if (!parsed.ok) return parsed.response;

  let data;
  try { data = await signIn(parsed.data.email, parsed.data.password); }
  catch { return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 }); }

  const response = NextResponse.json({
    user: { id: data.user.id, name: data.user.user_metadata.name ?? data.user.email, email: data.user.email },
  });
  response.cookies.set("behemoth_session", sessionCookieValue(data.session.access_token, data.session.refresh_token), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return response;
}
