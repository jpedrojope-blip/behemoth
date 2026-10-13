import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { runAutomations } from "@/lib/automations";
import { createSeed } from "@/lib/seed";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { userFromRequest } from "@/lib/supabase-auth";
import { recordAudit } from "@/lib/store";
import { DEFAULT_AUTOMATIONS, type Database } from "@/lib/types";

type WorkspaceIdentity = {
  id: string;
  name: string;
  niche: string;
  plan: string;
  ownerName: string;
  ownerRole: "ADMIN" | "MANAGER" | "MEMBER";
  local: boolean;
};

type WorkspaceCache = Map<string, Database>;
type WorkspaceSnapshot = { db: Database; version: string | null };
const globalWorkspaceCache = globalThis as typeof globalThis & { __behemothWorkspaceCache?: WorkspaceCache };
const localCache = (globalWorkspaceCache.__behemothWorkspaceCache ??= new Map());
const LOCAL_DATA_DIR = path.join(process.cwd(), ".data", "workspaces");

export class WorkspaceAccessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}

class WorkspaceConflictError extends Error {
  constructor() {
    super("Os dados foram atualizados em outro dispositivo. Tente novamente.");
    this.name = "WorkspaceConflictError";
  }
}

function normalize(db: Database): Database {
  return {
    ...db,
    automations: { ...DEFAULT_AUTOMATIONS, ...(db.automations ?? {}) },
    transactions: db.transactions ?? [],
    team: db.team ?? [],
    meetings: (db.meetings ?? []).map((meeting) => ({ ...meeting, summary: meeting.summary ?? "" })),
    events: db.events ?? [],
    audit: db.audit ?? [],
    dismissed: db.dismissed ?? [],
  };
}

function emptyDatabase(workspace: WorkspaceIdentity): Database {
  return {
    company: {
      id: workspace.id,
      name: workspace.name || "Minha empresa",
      niche: workspace.niche || "",
      plan: workspace.plan || "Basic",
      ownerName: workspace.ownerName || "Você",
      ownerRole: workspace.ownerRole,
    },
    automations: {
      recurringTransactions: true,
      teamCostToExpenses: true,
      actionItemsToCalendar: true,
      meetingsToCalendar: true,
      paymentsToExpenses: true,
    },
    transactions: [],
    team: [],
    meetings: [],
    events: [],
    audit: [],
    dismissed: [],
  };
}

async function identityFromRequest(request: Request): Promise<WorkspaceIdentity> {
  let user: Awaited<ReturnType<typeof userFromRequest>>;
  try {
    user = await userFromRequest(request);
  } catch {
    throw new WorkspaceAccessError("Não foi possível validar sua sessão. Entre novamente.", 503);
  }
  if (!user) throw new WorkspaceAccessError("Entre na sua conta para acessar os dados da empresa.", 401);

  if ("companyId" in user) {
    return {
      id: user.companyId,
      name: `Workspace de ${user.name}`,
      niche: "",
      plan: "Basic",
      ownerName: user.name,
      ownerRole: "ADMIN",
      local: true,
    };
  }

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch {
    throw new WorkspaceAccessError("O armazenamento do workspace não está configurado.", 503);
  }

  const membership = await admin
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membership.error) throw new WorkspaceAccessError("Não foi possível localizar o workspace desta conta.", 503);
  if (!membership.data?.workspace_id) throw new WorkspaceAccessError("Esta conta ainda não está vinculada a um workspace.", 403);

  const workspaceResult = await admin
    .from("workspaces")
    .select("id, name, niche, plan")
    .eq("id", membership.data.workspace_id)
    .single();
  if (workspaceResult.error || !workspaceResult.data) {
    throw new WorkspaceAccessError("Não foi possível carregar o workspace desta conta.", 503);
  }

  return {
    id: workspaceResult.data.id,
    name: workspaceResult.data.name,
    niche: workspaceResult.data.niche,
    plan: workspaceResult.data.plan,
    ownerName: typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : typeof user.user_metadata?.name === "string" ? user.user_metadata.name : (user.email?.split("@")[0] ?? "Você"),
    ownerRole: membership.data.role === "MANAGER" || membership.data.role === "MEMBER" ? membership.data.role : "ADMIN",
    local: false,
  };
}

function safeLocalPath(workspaceId: string) {
  if (!/^[\w-]{1,100}$/.test(workspaceId)) throw new WorkspaceAccessError("Identificador de workspace inválido.", 400);
  return path.join(LOCAL_DATA_DIR, `${workspaceId}.json`);
}

async function loadWorkspace(identity: WorkspaceIdentity): Promise<WorkspaceSnapshot> {
  if (identity.local) {
    const cached = localCache.get(identity.id);
    if (cached) return { db: normalize(JSON.parse(JSON.stringify(cached)) as Database), version: null };
    let db: Database | null = null;
    try {
      db = JSON.parse(fs.readFileSync(safeLocalPath(identity.id), "utf8")) as Database;
    } catch {
      db = null;
    }
    const loaded = normalize(db ?? emptyDatabase(identity));
    localCache.set(identity.id, loaded);
    return { db: loaded, version: null };
  }

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch {
    throw new WorkspaceAccessError("O armazenamento do workspace não está configurado.", 503);
  }

  const result = await admin
    .from("workspace_app_state")
    .select("state, updated_at")
    .eq("workspace_id", identity.id)
    .maybeSingle();
  if (result.error) {
    throw new WorkspaceAccessError("A estrutura de armazenamento do workspace ainda não foi aplicada no Supabase.", 503);
  }
  if (result.data?.state && typeof result.data.state === "object") {
    return { db: normalize(result.data.state as Database), version: result.data.updated_at };
  }

  const fresh = emptyDatabase(identity);
  const inserted = await admin.from("workspace_app_state").insert({ workspace_id: identity.id, state: fresh }).select("updated_at").single();
  if (inserted.error) {
    const current = await admin.from("workspace_app_state").select("state, updated_at").eq("workspace_id", identity.id).maybeSingle();
    if (!current.data?.state || current.error) throw new WorkspaceAccessError("Não foi possível inicializar os dados deste workspace.", 503);
    return { db: normalize(current.data.state as Database), version: current.data.updated_at };
  }
  return { db: fresh, version: inserted.data.updated_at };
}

async function persistWorkspace(identity: WorkspaceIdentity, db: Database, version: string | null) {
  if (identity.local) {
    const file = safeLocalPath(identity.id);
    fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(db, null, 2), "utf8");
    localCache.set(identity.id, db);
    return;
  }

  if (!version) throw new WorkspaceAccessError("Não foi possível validar a versão dos dados do workspace.", 503);
  const nextVersion = new Date(Math.max(Date.now(), Date.parse(version) + 1)).toISOString();
  const result = await getSupabaseAdmin()
    .from("workspace_app_state")
    .update({ state: db, updated_at: nextVersion })
    .eq("workspace_id", identity.id)
    .eq("updated_at", version)
    .select("updated_at")
    .maybeSingle();
  if (result.error) throw new WorkspaceAccessError("Não foi possível salvar os dados do workspace no Supabase.", 503);
  if (!result.data) throw new WorkspaceConflictError();
}

export async function withWorkspaceDatabase(
  request: Request,
  action: (db: Database) => Response | Promise<Response>,
) {
  try {
    const identity = await identityFromRequest(request);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const snapshot = await loadWorkspace(identity);
      const db = snapshot.db;
      const before = runAutomations(db);
      for (const id of before) recordAudit(db, "AUTO", "automation", id, true);
      const response = await action(db);
      let changed = before.length > 0;
      if (response.status >= 400) return response;

      const after = runAutomations(db);
      for (const id of after) recordAudit(db, "AUTO", "automation", id, true);
      changed ||= after.length > 0;
      if (request.method !== "GET") changed = true;
      if (!changed) return response;

      try {
        await persistWorkspace(identity, db, snapshot.version);
        return response;
      } catch (error) {
        if (!(error instanceof WorkspaceConflictError) || attempt === 2) throw error;
      }
    }
    throw new WorkspaceConflictError();
  } catch (error) {
    const status = error instanceof WorkspaceConflictError ? 409 : error instanceof WorkspaceAccessError ? error.status : 503;
    const message = error instanceof WorkspaceConflictError || error instanceof WorkspaceAccessError
      ? error.message
      : "Não foi possível acessar os dados do workspace. Tente novamente.";
    return NextResponse.json({ error: message }, { status });
  }
}

export function workspaceStorageIsConfigured() {
  return process.env.AUTH_PROVIDER === "local" && process.env.ENABLE_LOCAL_DEMO_AUTH === "true"
    ? true
    : Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function resetWorkspaceData(db: Database, keepCompany: boolean) {
  const company = { ...db.company };
  db.transactions = [];
  db.team = [];
  db.meetings = [];
  db.events = [];
  db.dismissed = [];
  db.audit = [];
  if (!keepCompany) Object.assign(db.company, { name: "Minha empresa", niche: "", plan: "Basic", ownerName: "Você" });
  recordAudit(db, "RESET", "company", company.id);
}

export function resetWorkspaceDemo(db: Database) {
  const workspaceId = db.company.id;
  const company = { ...db.company };
  const demo = createSeed();
  demo.company = { ...demo.company, ...company, id: workspaceId };
  demo.transactions = demo.transactions.map((transaction) => ({ ...transaction, companyId: workspaceId }));
  demo.team = demo.team.map((member) => ({ ...member, companyId: workspaceId }));
  demo.meetings = demo.meetings.map((meeting) => ({ ...meeting, companyId: workspaceId }));
  demo.events = demo.events.map((event) => ({ ...event, companyId: workspaceId }));
  Object.assign(db, demo);
  recordAudit(db, "RESET_DEMO", "company", workspaceId);
}
