import { NextResponse } from "next/server";
import { parseBody, transactionUpdateSchema } from "@/lib/schemas";
import { dismiss, recordAudit } from "@/lib/store";
import { withWorkspaceDatabase } from "@/lib/workspace-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = await parseBody(request, transactionUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  return withWorkspaceDatabase(request, (db) => {
    const transaction = db.transactions.find((item) => item.id === id);
    if (!transaction) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
    if (transaction.auto && id.startsWith("auto_team_")) {
      const keys = Object.keys(body);
      if (keys.length !== 1 || keys[0] !== "status") {
        return NextResponse.json(
          { error: "Edite apenas a situação da estimativa. Para alterar o valor, atualize os custos dos integrantes da equipe." },
          { status: 409 },
        );
      }
      transaction.status = body.status ?? transaction.status;
      if (transaction.status === "CONFIRMED") {
        transaction.auto = false;
        transaction.description = "Custo confirmado da equipe e agentes";
      }
      recordAudit(db, "UPDATE", "transaction", transaction.id);
      return NextResponse.json({ transaction });
    }
    if (transaction.auto) {
      return NextResponse.json(
        { error: "Este lançamento é gerado por automação. Edite a origem dele ou desligue a regra em Configurações." },
        { status: 409 },
      );
    }

    const nextReport = body.financialReport ?? transaction.financialReport ?? "DRE";
    const explicitCashDate = body.cashDate ?? (transaction.cashDateConfirmed ? transaction.cashDate : undefined);
    if (nextReport === "BOTH" && !explicitCashDate) {
      return NextResponse.json({ error: "Informe a data de liquidação antes de incluir o lançamento no fluxo de caixa." }, { status: 400 });
    }
    Object.assign(transaction, body);
    if (nextReport === "DFC") {
      transaction.cashDate = body.cashDate ?? body.date ?? transaction.cashDate ?? transaction.date;
      transaction.cashDateConfirmed = true;
    } else if (nextReport === "BOTH") {
      transaction.cashDate = explicitCashDate;
      transaction.cashDateConfirmed = true;
    } else if (body.financialReport === "DRE") {
      delete transaction.cashDateConfirmed;
    }
    recordAudit(db, "UPDATE", "transaction", transaction.id);
    return NextResponse.json({ transaction });
  });
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return withWorkspaceDatabase(request, (db) => {
    const index = db.transactions.findIndex((item) => item.id === id);
    if (index === -1) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });

    const [removed] = db.transactions.splice(index, 1);
    // Item automático apagado à mão não volta na próxima rodada.
    if (removed.auto) dismiss(db, removed.id);
    recordAudit(db, "DELETE", "transaction", id);
    return NextResponse.json({ ok: true });
  });
}
