import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type AuthUser = { id: string; email: string; passwordHash: string; companyId: string; name: string; avatarUrl?: string };
export type LocalUser = Omit<AuthUser, "passwordHash">;

const dataDir = path.join(process.cwd(), ".data");
const usersFile = path.join(dataDir, "users.json");
const sessionSecretFile = path.join(dataDir, "auth-session-secret");

function users(): AuthUser[] {
  try {
    return JSON.parse(fs.readFileSync(usersFile, "utf8")) as AuthUser[];
  } catch {
    return [];
  }
}

function save(value: AuthUser[]) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(usersFile, JSON.stringify(value, null, 2), "utf8");
}

function publicUser(user: AuthUser): LocalUser {
  return { id: user.id, email: user.email, companyId: user.companyId, name: user.name, avatarUrl: user.avatarUrl };
}

function equalBuffers(left: Buffer, right: Buffer) {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function verifyPassword(user: AuthUser, password: string, allUsers: AuthUser[]) {
  const [algorithm, saltValue, hashValue] = user.passwordHash.split("$");
  if (algorithm === "scrypt" && saltValue && hashValue) {
    const expected = Buffer.from(hashValue, "base64url");
    const actual = crypto.scryptSync(password, Buffer.from(saltValue, "base64url"), expected.length);
    return equalBuffers(actual, expected);
  }

  // Contas criadas por versões anteriores usavam SHA-256. Migra o hash no primeiro login.
  if (/^[a-f\d]{64}$/i.test(user.passwordHash)) {
    const expected = Buffer.from(user.passwordHash, "hex");
    const actual = crypto.createHash("sha256").update(password).digest();
    if (!equalBuffers(actual, expected)) return false;
    user.passwordHash = hashPassword(password);
    save(allUsers);
    return true;
  }

  return false;
}

export function findUser(email: string): LocalUser | null {
  const user = users().find((entry) => entry.email.toLowerCase() === email.trim().toLowerCase());
  return user ? publicUser(user) : null;
}

export function authenticateUser(email: string, password: string): LocalUser | null {
  const allUsers = users();
  const user = allUsers.find((entry) => entry.email.toLowerCase() === email.trim().toLowerCase());
  if (!user || !verifyPassword(user, password, allUsers)) return null;
  return publicUser(user);
}

export function createUser(email: string, password: string, companyId: string, name: string): LocalUser | null {
  const allUsers = users();
  const normalizedEmail = email.trim().toLowerCase();
  if (allUsers.some((user) => user.email.toLowerCase() === normalizedEmail)) return null;
  const user: AuthUser = {
    id: `user_${crypto.randomUUID()}`,
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    companyId,
    name,
  };
  allUsers.push(user);
  save(allUsers);
  return publicUser(user);
}

export function updateUserProfile(userId: string, name: string, avatarUrl?: string | null): LocalUser | null {
  const allUsers = users();
  const user = allUsers.find((entry) => entry.id === userId);
  if (!user) return null;
  user.name = name;
  if (avatarUrl === null) delete user.avatarUrl;
  else if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
  save(allUsers);
  return publicUser(user);
}

function getSessionSecret(): Buffer {
  try {
    return Buffer.from(fs.readFileSync(sessionSecretFile, "utf8").trim(), "hex");
  } catch {
    fs.mkdirSync(dataDir, { recursive: true });
    const value = crypto.randomBytes(32).toString("hex");
    try {
      fs.writeFileSync(sessionSecretFile, value, { encoding: "utf8", flag: "wx" });
      return Buffer.from(value, "hex");
    } catch {
      return Buffer.from(fs.readFileSync(sessionSecretFile, "utf8").trim(), "hex");
    }
  }
}

export function createLocalSessionToken(userId: string) {
  const payload = Buffer.from(userId, "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `local.${payload}.${signature}`;
}

export function findUserBySessionToken(token: string): LocalUser | null {
  const [prefix, payload, signature, extra] = token.split(".");
  if (prefix !== "local" || !payload || !signature || extra) return null;
  const expected = crypto.createHmac("sha256", getSessionSecret()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (!equalBuffers(actual, expected)) return null;

  let userId: string;
  try {
    userId = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const user = users().find((entry) => entry.id === userId);
  return user ? publicUser(user) : null;
}
