import { NextResponse } from "next/server";
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Data inválida").transform((value) => value.slice(0, 10));
const money = z.coerce.number().positive("O valor precisa ser maior que zero.");
const percentValue = z.coerce.number().min(0).max(100);

export const transactionCreateSchema = z.object({
  description: z.string().trim().min(1, "Informe a descrição."),
  amount: money,
  kind: z.enum(["INCOME", "EXPENSE"]),
  category: z.string().trim().optional(),
  date: isoDate.optional(),
  status: z.enum(["CONFIRMED", "PENDING"]).default("CONFIRMED"),
  recurrence: z.enum(["NONE", "MONTHLY"]).default("NONE"),
  source: z.string().trim().optional(),
});

export const transactionUpdateSchema = z.object({
  description: z.string().trim().min(1).optional(),
  amount: money.optional(),
  kind: z.enum(["INCOME", "EXPENSE"]).optional(),
  category: z.string().trim().min(1).optional(),
  date: isoDate.optional(),
  status: z.enum(["CONFIRMED", "PENDING"]).optional(),
  recurrence: z.enum(["NONE", "MONTHLY"]).optional(),
});

export const teamCreateSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome."),
  role: z.string().trim().min(1, "Informe a função."),
  type: z.enum(["HUMAN", "AI"]).default("HUMAN"),
  performance: percentValue.default(0),
  target: percentValue.default(100),
  monthlyCost: z.coerce.number().min(0).default(0),
  roi: z.coerce.number().min(0).default(0),
  status: z.enum(["ACTIVE", "REVIEW"]).default("ACTIVE"),
});

export const teamUpdateSchema = teamCreateSchema.partial();

export const meetingCreateSchema = z.object({
  title: z.string().trim().min(1, "Informe o título da reunião."),
  date: z.string().min(1).optional(),
  participants: z.array(z.string()).default([]),
  notes: z.string().default(""),
  transcript: z.string().default(""),
});

export const actionItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1),
  owner: z.string().default(""),
  due: z.string().default(""),
  done: z.boolean().default(false),
});

export const meetingUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  date: z.string().min(1).optional(),
  participants: z.array(z.string()).optional(),
  notes: z.string().optional(),
  transcript: z.string().optional(),
  summary: z.string().optional(),
  actionItems: z.array(actionItemSchema).optional(),
});

export const eventCreateSchema = z.object({
  title: z.string().trim().min(1, "Informe o título."),
  date: isoDate,
  time: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
  durationMinutes: z.coerce.number().min(5).default(30),
  kind: z.enum(["MEETING", "TASK", "PAYMENT", "EVENT"]).default("EVENT"),
  owner: z.string().trim().optional(),
  amount: z.coerce.number().min(0).optional(),
});

export const eventUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  date: isoDate.optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  durationMinutes: z.coerce.number().min(5).optional(),
  owner: z.string().trim().min(1).optional(),
  amount: z.coerce.number().min(0).optional(),
  done: z.boolean().optional(),
});

export const settingsUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  niche: z.string().trim().optional(),
  plan: z.string().trim().min(1).optional(),
  ownerName: z.string().trim().min(1).optional(),
  ownerRole: z.enum(["ADMIN", "MANAGER", "MEMBER"]).optional(),
  automations: z
    .object({
      recurringTransactions: z.boolean(),
      teamCostToExpenses: z.boolean(),
      actionItemsToCalendar: z.boolean(),
      meetingsToCalendar: z.boolean(),
      paymentsToExpenses: z.boolean(),
    })
    .partial()
    .optional(),
});

export const resetSchema = z.object({
  mode: z.enum(["demo", "empty"]).default("demo"),
  keepCompany: z.boolean().default(false),
});

export const loginSchema = z.object({
  email: z.string().email("Email inválido."),
  password: z.string().min(1, "Informe a senha."),
});

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** Lê e valida o corpo da requisição, devolvendo a resposta de erro pronta. */
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 }) };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      response: NextResponse.json(
        { error: first?.message ?? "Dados inválidos.", field: first?.path.join("."), issues: parsed.error.issues },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
