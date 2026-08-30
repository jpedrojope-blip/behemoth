import type { Role } from "@/lib/types";

export function can(role: Role, action: "read" | "write" | "admin") {
  if (action === "read") return true;
  if (action === "write") return role !== "MEMBER";
  return role === "ADMIN";
}

export function permissionsFor(role: Role) {
  return { read: can(role, "read"), write: can(role, "write"), admin: can(role, "admin") };
}

export function integrationStatus() {
  return {
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseService: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    whatsapp: Boolean(process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID),
    ai: process.env.AI_PROVIDER && process.env.AI_PROVIDER !== "mock" ? Boolean(process.env.AI_API_KEY) : false,
    aiProvider: process.env.AI_PROVIDER ?? "mock",
  };
}
