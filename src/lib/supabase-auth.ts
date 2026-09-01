import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function translateAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("already been registered") || normalized.includes("already registered")) return "Este e-mail já está cadastrado.";
  if (normalized.includes("invalid login credentials")) return "E-mail ou senha inválidos.";
  if (normalized.includes("password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (normalized.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (normalized.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  return message;
}

function getPublicClient(): SupabaseClient {
  if (!url || !publishableKey) throw new Error("Supabase não configurado.");
  return createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function signIn(email: string, password: string) {
  const { data, error } = await getPublicClient().auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) throw new Error(translateAuthError(error?.message ?? "E-mail ou senha inválidos."));
  return data;
}

export async function signUp(email: string, password: string, name: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) throw new Error(translateAuthError(error?.message ?? "Não foi possível criar a conta."));
  const { data: workspace, error: workspaceError } = await admin.from("workspaces").insert({ name: `Workspace de ${name}`, niche: "", plan: "Basic" }).select("id").single();
  if (workspaceError || !workspace) throw new Error("A conta foi criada, mas o workspace não pôde ser criado.");
  const { error: memberError } = await admin.from("workspace_members").insert({ workspace_id: workspace.id, user_id: data.user.id, role: "ADMIN" });
  if (memberError) throw new Error("A conta foi criada, mas não foi possível vincular o workspace.");
  return { user: data.user, workspaceId: workspace.id };
}

export function sessionCookieValue(accessToken: string, refreshToken: string) {
  return Buffer.from(JSON.stringify({ accessToken, refreshToken }), "utf8").toString("base64url");
}

export function parseSessionCookie(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { accessToken?: string; refreshToken?: string };
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
  } catch { return null; }
}

export async function getUserFromAccessToken(token: string): Promise<User | null> {
  const { data } = await getPublicClient().auth.getUser(token);
  return data.user;
}
