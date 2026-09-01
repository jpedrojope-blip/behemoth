import { NextResponse } from "next/server";
import { loginSchema, parseBody } from "@/lib/schemas";
import { signUp, signIn, sessionCookieValue } from "@/lib/supabase-auth";

export async function POST(request: Request) {
  const parsed = await parseBody(request, loginSchema);
  if (!parsed.ok) return parsed.response;
  const name = parsed.data.email.split("@")[0];
  let created;
  try { created = await signUp(parsed.data.email, parsed.data.password, name); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível criar a conta." }, { status: 409 }); }
  let session;
  try { session = await signIn(parsed.data.email, parsed.data.password); } catch { session = null; }
  const response = NextResponse.json({ user: { id: created.user.id, email: created.user.email, workspaceId: created.workspaceId }, emailVerificationRequired: !session }, { status: 201 });
  if (session) response.cookies.set("behemoth_session", sessionCookieValue(session.session.access_token, session.session.refresh_token), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 604800, path: "/" });
  return response;
}
