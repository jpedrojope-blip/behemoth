import { NextResponse } from "next/server";
import { parseBody, transactionUpdateSchema } from "@/lib/schemas";
import { dismiss, mutate, recordAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = await parseBody(request, transactionUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  return mutate((db) => {
    const transaction = db.transactions.find((item) => item.id === id);
    if (!transaction) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
    if (transaction.auto) {
      return NextResponse.json(
        { error: "Este lançamento é gerado por automação. Edite a origem dele ou desligue a regra em Configurações." },
        { status: 409 },
      );
    }

    Object.assign(transaction, body);
    recordAudit(db, "UPDATE", "transaction", transaction.id);
    return NextResponse.json({ transaction });
  });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  return mutate((db) => {
    const index = db.transactions.findIndex((item) => item.id === id);
    if (index === -1) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });

    const [removed] = db.transactions.splice(index, 1);
    // Item automático apagado à mão não volta na próxima rodada.
    if (removed.auto) dismiss(db, removed.id);
    recordAudit(db, "DELETE", "transaction", id);
    return NextResponse.json({ ok: true });
  });
}
