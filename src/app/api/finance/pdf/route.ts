import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

function parseTransactions(text: string) {
  const datePattern = /(\d{2}[\/-]\d{2}[\/-]\d{4}|\d{4}-\d{2}-\d{2})/;
  const moneyPattern = /(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})*,\d{2}|(?:R\$\s*)?-?\d+(?:\.\d{2})/;
  return text.split(/\r?\n/).flatMap((line) => {
    const dateMatch = line.match(datePattern);
    const moneyMatches = line.match(new RegExp(moneyPattern.source, "g"));
    if (!dateMatch || !moneyMatches?.length) return [];
    const rawDate = dateMatch[1];
    const dateParts = rawDate.includes("-") ? rawDate.split("-") : rawDate.split(/[\/-]/).reverse();
    const date = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`;
    const rawAmount = moneyMatches[moneyMatches.length - 1].replace(/R\$\s*/g, "");
    const amount = Number(rawAmount.includes(",") ? rawAmount.replace(/\./g, "").replace(",", ".") : rawAmount);
    if (!Number.isFinite(amount) || amount === 0) return [];
    const kind = rawAmount.trim().startsWith("-") || /despesa|pagamento|débito|debito|saída|saida/i.test(line)
      ? "EXPENSE"
      : "INCOME";
    const description = line
      .replace(dateMatch[0], "")
      .replace(moneyPattern, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[-|–—]+|[-|–—]+$/g, "") || "Lançamento importado";
    return [{ date, description, amount: Math.abs(amount), kind, category: kind === "INCOME" ? "Receita" : "Outros" }];
  }).slice(0, 200);
}

function parseSpreadsheet(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const output: Array<{ date: string; description: string; amount: number; kind: "INCOME" | "EXPENSE"; category: string }> = [];
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
    for (const row of rows) {
      const entries = Object.entries(row);
      const find = (terms: string[]) => entries.find(([key]) => terms.some((term) => key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term)) )?.[1];
      const rawDate = find(["data", "date"]);
      const rawAmount = find(["valor", "amount", "total", "preco", "receita", "despesa"]);
      if (!rawDate || rawAmount === undefined || rawAmount === "") continue;
      const date = rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate).match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? String(rawDate).split(/[\/-]/).reverse().join("-");
      const amountText = String(rawAmount).replace(/R\$\s*/g, "");
      const amount = Number(amountText.includes(",") ? amountText.replace(/\./g, "").replace(",", ".") : amountText);
      if (!date || !Number.isFinite(amount) || amount === 0) continue;
      const description = String(find(["descricao", "descrição", "historico", "histórico", "cliente", "nome"]) ?? `Importado de ${sheetName}`).trim();
      const rawKind = String(find(["tipo", "natureza", "movimento"]) ?? "").toLowerCase();
      const kind = amount < 0 || /despesa|saida|saída|debito|débito|custo/.test(rawKind) ? "EXPENSE" : "INCOME";
      output.push({ date, description, amount: Math.abs(amount), kind, category: String(find(["categoria", "category", "conta"]) ?? (kind === "INCOME" ? "Receita" : "Outros")) });
    }
  }
  return output.slice(0, 500);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie um arquivo PDF." }, { status: 400 });
  }
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isSpreadsheet = /\.xlsx?$/i.test(file.name);
  if (!isPdf && !isSpreadsheet) {
    return NextResponse.json({ error: "Envie um arquivo PDF ou Excel (.xlsx/.xls)." }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "O PDF deve ter no máximo 10 MB." }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (isSpreadsheet) {
    return NextResponse.json({ fileName: file.name, pages: 0, text: "Planilha processada.", transactions: parseSpreadsheet(buffer) });
  }
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = result.text.trim();
    return NextResponse.json({ fileName: file.name, pages: result.total, text, transactions: parseTransactions(text) });
  } catch {
    return NextResponse.json({ error: "Não foi possível ler este PDF." }, { status: 422 });
  } finally {
    await parser.destroy();
  }
}
