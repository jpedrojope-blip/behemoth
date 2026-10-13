import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { findUserBySessionToken, type LocalUser } from "@/lib/auth-store";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function usesLocalDemoAuth() {
  return process.env.NODE_ENV !== "production"
    && process.env.AUTH_PROVIDER === "local"
    && process.env.ENABLE_LOCAL_DEMO_AUTH === "true";
}

export class SupabaseUnavailableError extends Error {
  constructor() {
    super("Não foi possível conectar ao Supabase. Confira se o projeto está ativo e se a URL e as chaves pertencem ao mesmo projeto.");
    this.name = "SupabaseUnavailableError";
  }
}

function throwIfSupabaseUnavailable(error: unknown) {
  if (!error || typeof error !== "object") return;
  const details = error as { name?: unknown; message?: unknown; status?: unknown };
  const message = typeof details.message === "string" ? details.message.toLowerCase() : "";
  if (
    details.name === "AuthRetryableFetchError"
    || details.status === 0
    || message === "fetch failed"
    || message.includes("invalid api key")
  ) {
    throw new SupabaseUnavailableError();
  }
}

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
  if (!url || !publishableKey) throw new SupabaseUnavailableError();
  return createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function getAdminClient() {
  try {
    return getSupabaseAdmin();
  } catch {
    throw new SupabaseUnavailableError();
  }
}

export async function signIn(email: string, password: string) {
  const client = getPublicClient();
  const firstAttempt = await client.auth.signInWithPassword({ email, password });
  if (firstAttempt.data.session && firstAttempt.data.user) return firstAttempt.data;
  if (firstAttempt.error) throwIfSupabaseUnavailable(firstAttempt.error);

  if (firstAttempt.error?.message.toLowerCase().includes("email not confirmed")) {
    const admin = getAdminClient();
    const lookup = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (lookup.error) throwIfSupabaseUnavailable(lookup.error);
    const existingUser = lookup.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      const confirmed = await admin.auth.admin.updateUserById(existingUser.id, { email_confirm: true });
      if (!confirmed.error) {
        const retry = await client.auth.signInWithPassword({ email, password });
        if (retry.data.session && retry.data.user) return retry.data;
      }
    }
  }

  throw new Error(translateAuthError(firstAttempt.error?.message ?? "E-mail ou senha inválidos."));
}

export async function signUp(email: string, password: string, name: string) {
  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error) throwIfSupabaseUnavailable(error);
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

export function sessionFromRequest(request: Request) {
  const raw = request.headers.get("cookie")?.match(/(?:^|;\s*)behemoth_session=([^;]+)/)?.[1];
  if (!raw) return null;
  try { return parseSessionCookie(decodeURIComponent(raw)); }
  catch { return null; }
}

export async function getUserFromAccessToken(token: string): Promise<User | LocalUser | null> {
  if (token.startsWith("local.")) {
    return usesLocalDemoAuth() ? findUserBySessionToken(token) : null;
  }
  const { data } = await getPublicClient().auth.getUser(token);
  return data.user;
}

export async function userFromRequest(request: Request): Promise<User | LocalUser | null> {
  const session = sessionFromRequest(request);
  return session ? getUserFromAccessToken(session.accessToken) : null;
}

export function profileFromUser(user: User | LocalUser) {
  const email = user.email ?? "";
  const localPart = email.split("@")[0] ?? "";
  const suggestedName = localPart
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1))
    .join(" ");
  const metadata = "user_metadata" in user ? user.user_metadata : null;
  const metadataName = metadata && typeof metadata.display_name === "string"
    ? metadata.display_name
    : metadata && typeof metadata.name === "string" ? metadata.name : null;
  const name = "name" in user && typeof user.name === "string" && user.name.trim()
    ? user.name.trim()
    : metadataName?.trim() || suggestedName || "Você";
  const avatarUrl = "avatarUrl" in user && typeof user.avatarUrl === "string"
    ? user.avatarUrl
    : metadata && typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;
  return { id: user.id, email, name, avatarUrl };
}
