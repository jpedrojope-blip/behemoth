import fs from "node:fs";
import path from "node:path";
import { runAutomations } from "@/lib/automations";
import { createSeed } from "@/lib/seed";
import { DEFAULT_AUTOMATIONS, type AuditEntry, type Database } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "behemoth.json");

type Cache = { db: Database | null; writable: boolean };

// Survives hot reloads in dev, where module state is otherwise discarded.
const globalCache = globalThis as unknown as { __behemothCache?: Cache };
const cache: Cache = (globalCache.__behemothCache ??= { db: null, writable: true });

function readFromDisk(): Database | null {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as Database;
  } catch {
    return null;
  }
}

function writeToDisk(db: Database) {
  if (!cache.writable) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
  } catch {
    // Read-only filesystem (serverless): keep serving from memory.
    cache.writable = false;
  }
}

/** Completa arquivos gravados por versões anteriores do schema. */
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

function load(): Database {
  if (cache.db) {
    // O cache sobrevive a hot reloads: pode ter sido gravado por um schema anterior.
    if (!cache.db.automations || !cache.db.dismissed) cache.db = normalize(cache.db);
    return cache.db;
  }
  const fromDisk = readFromDisk();
  const db = normalize(fromDisk ?? createSeed());
  cache.db = db;
  if (!fromDisk) writeToDisk(db);
  return db;
}

/**
 * Leitura já com as automações aplicadas. Sempre que algo é gerado,
 * o resultado é persistido para as próximas leituras serem baratas.
 */
export function getDatabase(): Database {
  const db = load();
  const applied = runAutomations(db);
  if (applied.length) {
    for (const id of applied) recordAudit(db, "AUTO", "automation", id, true);
    writeToDisk(db);
  }
  return db;
}

/** Escrita: automações rodam antes e depois, para a mudança cascatear. */
export function mutate<T>(action: (db: Database) => T): T {
  const db = getDatabase();
  const result = action(db);
  const applied = runAutomations(db);
  for (const id of applied) recordAudit(db, "AUTO", "automation", id, true);
  writeToDisk(db);
  return result;
}

export function resetDatabase(): Database {
  const seeded = normalize(createSeed());
  cache.db = seeded;
  runAutomations(seeded);
  writeToDisk(seeded);
  return seeded;
}

/** Marca um item automático como descartado para que não seja recriado. */
export function dismiss(db: Database, id: string) {
  if (!db.dismissed.includes(id)) db.dismissed.push(id);
}

export function recordAudit(db: Database, action: string, entity: string, entityId: string, auto = false) {
  const entry: AuditEntry = {
    id: createId("audit"),
    at: new Date().toISOString(),
    actor: auto ? "Automação" : db.company.ownerName,
    action,
    entity,
    entityId,
    auto,
  };
  db.audit.unshift(entry);
  db.audit = db.audit.slice(0, 200);
  return entry;
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function isPersistent() {
  return cache.writable;
}
