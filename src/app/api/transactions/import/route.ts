import { NextResponse } from "next/server";
import { transactionCreateSchema, parseBody } from "@/lib/schemas";
import { createId, recordAudit } from "@/lib/store";
import { repairImportedSaleTransactions } from "@/lib/finance";
import { withWorkspaceDatabase } from "@/lib/workspace-store";
import type { Transaction } from "@/lib/types";
import { z } from "zod";

export const dynamic = "force-dynamic";

const importSchema = z.object({
  importId: z.string().regex(/^[a-f0-9]{64}$/, "Identificador de importação inválido."),
  transactions: z.array(transactionCreateSchema).min(1).max(500),
});

export async function POST(request: Request) {
  const parsed = await parseBody(request, importSchema);
  if (!parsed.ok) return parsed.response;
  const { importId, transactions } = parsed.data;

  return withWorkspaceDatabase(request, (db) => {
    const previouslyImported = db.transactions.filter((transaction) => transaction.importBatchId === importId);
    if (previouslyImported.length) {
      return NextResponse.json({ imported: previouslyImported.length, duplicate: true });
    }

    const imported: Transaction[] = transactions.map((body) => ({
      id: createId("tx"),
      companyId: db.company.id,
      importBatchId: importId,
      kind: body.kind,
      date: body.date ?? body.competenceDate ?? body.cashDate ?? new Date().toISOString().slice(0, 10),
      ...(body.financialReport !== "DFC" ? { competenceDate: body.competenceDate ?? body.date } : {}),
      ...(body.financialReport === "DFC" ? { cashDate: body.cashDate ?? body.date } : body.financialReport === "BOTH" && body.cashDate ? { cashDate: body.cashDate } : {}),
      ...(body.financialReport === "DFC" || (body.financialReport === "BOTH" && body.cashDate) ? { cashDateConfirmed: true } : {}),
      financialReport: body.financialReport,
      costBehavior: body.kind === "EXPENSE" ? body.costBehavior : undefined,
      description: body.description,
      category: body.category || (body.kind === "INCOME" ? "Receita" : "Outros"),
      accountCode: body.accountCode,
      amount: body.amount,
      source: body.source ?? "import",
      status: body.status,
      recurrence: body.recurrence,
    }));

    repairImportedSaleTransactions(imported);
    db.transactions.push(...imported);
    recordAudit(db, "IMPORT", "transactions", importId);
    return NextResponse.json({ imported: imported.length, duplicate: false });
  });
}
