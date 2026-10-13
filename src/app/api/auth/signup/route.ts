import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { parseBody, signupSchema } from "@/lib/schemas";
import { createLocalSessionToken, createUser } from "@/lib/auth-store";
import { signUp, signIn, sessionCookieValue, SupabaseUnavailableError, usesLocalDemoAuth } from "@/lib/supabase-auth";

export async function POST(request: Request) {
  const parsed = await parseBody(request, signupSchema);
  if (!parsed.ok) return parsed.response;
  const emailName = parsed.data.email.split("@")[0] ?? "Você";
  const name = parsed.data.name?.trim() || emailName;

  if (usesLocalDemoAuth()) {
    const workspaceId = randomUUID();
    const user = createUser(parsed.data.email, parsed.data.password, workspaceId, name);
    if (!user) return NextResponse.json({ error: "Este e-mail já está cadastrado. Entre na conta existente." }, { status: 409 });
    const response = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, workspaceId }, emailVerificationRequired: false }, { status: 201 });
    response.cookies.set("behemoth_session", sessionCookieValue(createLocalSessionToken(user.id), "local"), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return response;
  }

  let created;
  try { created = await signUp(parsed.data.email, parsed.data.password, name); }
  catch (error) {
    const unavailable = error instanceof SupabaseUnavailableError;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível criar a conta." },
      { status: unavailable ? 503 : 409 },
    );
  }
  let session;
  try { session = await signIn(parsed.data.email, parsed.data.password); } catch { session = null; }
  const response = NextResponse.json({ user: { id: created.user.id, email: created.user.email, name, workspaceId: created.workspaceId }, emailVerificationRequired: !session }, { status: 201 });
  if (session) response.cookies.set("behemoth_session", sessionCookieValue(session.session.access_token, session.session.refresh_token), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 604800, path: "/" });
  return response;
}
