import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type AuthUser = { id: string; email: string; passwordHash: string; companyId: string; name: string };
const file = path.join(process.cwd(), ".data", "users.json");
function users(): AuthUser[] {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) as AuthUser[]; } catch { return []; }
}
function save(value: AuthUser[]) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
export function hashPassword(password: string) { return crypto.createHash("sha256").update(password).digest("hex"); }
export function findUser(email: string) { return users().find((user) => user.email.toLowerCase() === email.toLowerCase()); }
export function createUser(email: string, password: string, companyId: string, name: string) {
  const value = users();
  if (findUser(email)) return null;
  const user = { id: `user_${crypto.randomUUID()}`, email, passwordHash: hashPassword(password), companyId, name };
  value.push(user); save(value); return user;
}
