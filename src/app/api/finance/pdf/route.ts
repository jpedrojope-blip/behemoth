import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";
import { inflateRawSync } from "node:zlib";

export const dynamic = "force-dynamic";

type Kind = "INCOME" | "EXPENSE";
type Group = "RECEITA" | "IMPOSTO" | "CMV" | "RH" | "ADMINISTRATIVA" | "VENDAS" | "FINANCEIRA" | "INVESTIMENTO" | "NAO_OPERACIONAL" | "FINANCIAMENTO" | "OUTROS";
type Line = { name: string; amount: number; kind: Kind; group: Group; fixedness: "FIXO" | "VARIAVEL" | "MISTO" | "NAO_CLASSIFICADO"; total: boolean };
const MONEY = /(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})*,\d{2}|(?:R\$\s*)?-?\d+(?:\.\d{2})/g;

function normalized(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function amount(value: string) { const clean = value.replace(/R\$\s*/g, "").trim(); return Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean); }
function groupFor(name: string): Group {
  const v = normalized(name);
  if (/imposto|simples nacional|icms|iss\b|pis\b|cofins|tribut/.test(v)) return "IMPOSTO";
  if (/cmv|custo da mercadoria|fornecedor|insumo|embalagem|compra para revenda/.test(v)) return "CMV";
  if (/salario|folha|fgts|pro.?labore|vale transporte|beneficio|rh\b/.test(v)) return "RH";
  if (/aluguel|luz|energia|agua|telefone|internet|contador|contabil|assessoria|administrativ/.test(v)) return "ADMINISTRATIVA";
  if (/combustivel|design|maquininha|comissao|marketing|venda|frete/.test(v)) return "VENDAS";
  if (/juros|tarifa bancaria|rendimento|aplicacao financeira|financeir/.test(v)) return "FINANCEIRA";
  if (/divida|aporte.*soci|dividendo|emprestimo|financiamento/.test(v)) return "FINANCIAMENTO";
  if (/investimento|equipamento|imobilizado|aquisicao/.test(v)) return "INVESTIMENTO";
  if (/nao operacional|extraordinari|indenizacao/.test(v)) return "NAO_OPERACIONAL";
  if (/receita|venda|faturamento|revenda|delivery|recebimento|cliente/.test(v)) return "RECEITA";
  return "OUTROS";
}
function fixedness(group: Group): Line["fixedness"] { return group === "CMV" || group === "IMPOSTO" ? "VARIAVEL" : group === "RH" || group === "ADMINISTRATIVA" ? "FIXO" : group === "VENDAS" ? "MISTO" : "NAO_CLASSIFICADO"; }
function kindFor(name: string, value: number, group: Group): Kind {
  if (value < 0) return "EXPENSE";
  if (group === "RECEITA") return "INCOME";
  if ((group === "FINANCEIRA" || group === "NAO_OPERACIONAL" || group === "FINANCIAMENTO") && /receita|rendimento|aporte|aumento de divida|aumento divida/.test(normalized(name))) return "INCOME";
  return "EXPENSE";
}
function linesFrom(text: string): Line[] {
  return text.split(/\r?\n/).flatMap((raw) => {
    const values = raw.match(MONEY); if (!values?.length) return [];
    const name = raw.replace(MONEY, "").replace(/[|;]+/g, " ").replace(/\s+/g, " ").trim();
    const value = amount(values.at(-1) ?? ""); if (!name || !Number.isFinite(value) || value === 0) return [];
    const group = groupFor(name);
    return [{ name, amount: Math.abs(value), kind: kindFor(name, value, group), group, fixedness: fixedness(group), total: /total|lucro|resultado|margem|receita liquida|fluxo de caixa/i.test(normalized(name)) }];
  }).slice(0, 500);
}
function sum(lines: Line[], group: Group, kind?: Kind) { return lines.filter((line) => line.group === group && !line.total && (!kind || line.kind === kind)).reduce((total, line) => total + line.amount, 0); }
function named(lines: Line[], matcher: RegExp) { return lines.find((line) => matcher.test(normalized(line.name)))?.amount; }
function analysis(lines: Line[]) {
  const grossRevenue = named(lines, /receita bruta|faturamento bruto/) ?? sum(lines, "RECEITA", "INCOME");
  const taxes = named(lines, /impostos? sobre a receita|deduc.*receita/) ?? sum(lines, "IMPOSTO", "EXPENSE");
  const netRevenue = named(lines, /receita liquida/) ?? grossRevenue - taxes;
  const cmv = named(lines, /\bcmv\b|custo.*mercadoria|custos? variaveis/) ?? sum(lines, "CMV", "EXPENSE");
  const grossProfit = named(lines, /lucro bruto/) ?? netRevenue - cmv;
  const operatingExpenses = sum(lines, "RH", "EXPENSE") + sum(lines, "ADMINISTRATIVA", "EXPENSE") + sum(lines, "VENDAS", "EXPENSE") + sum(lines, "OUTROS", "EXPENSE");
  const financialIncome = sum(lines, "FINANCEIRA", "INCOME"), financialExpense = sum(lines, "FINANCEIRA", "EXPENSE");
  const nonOperatingIncome = sum(lines, "NAO_OPERACIONAL", "INCOME"), nonOperatingExpense = sum(lines, "NAO_OPERACIONAL", "EXPENSE");
  const financialResult = financialIncome - financialExpense, nonOperatingResult = nonOperatingIncome - nonOperatingExpense;
  const netProfit = named(lines, /lucro liquido|resultado liquido/) ?? grossProfit - operatingExpenses + financialResult + nonOperatingResult;
  const operationalCashFlow = grossRevenue - taxes - cmv - operatingExpenses + financialResult;
  const investments = sum(lines, "INVESTIMENTO", "EXPENSE"), financingIn = sum(lines, "FINANCIAMENTO", "INCOME"), financingOut = sum(lines, "FINANCIAMENTO", "EXPENSE");
  const freeCashFlow = operationalCashFlow + nonOperatingResult - investments + financingIn - financingOut;
  const cashIn = grossRevenue + financialIncome + nonOperatingIncome + financingIn;
  const cashOut = taxes + cmv + operatingExpenses + financialExpense + nonOperatingExpense + investments + financingOut;
  const projectedFixedOutflow = lines.filter((line) => line.kind === "EXPENSE" && line.fixedness === "FIXO" && !line.total).reduce((total, line) => total + line.amount, 0);
  return { detected: lines.length > 0, planOfAccounts: lines.slice(0, 80), summary: { grossRevenue, taxes, netRevenue, cmv, grossProfit, operatingExpenses, financialIncome, financialExpense, financialResult, nonOperatingIncome, nonOperatingExpense, nonOperatingResult, investments, financingIn, financingOut, netProfit, grossMargin: grossRevenue ? grossProfit / grossRevenue * 100 : null, netMargin: grossRevenue ? netProfit / grossRevenue * 100 : null, cashIn, cashOut, operationalCashFlow, freeCashFlow, projectedFixedOutflow }, verticalAnalysis: lines.filter((line) => !line.total).slice(0, 30).map((line) => ({ ...line, percentOfRevenue: grossRevenue ? line.amount / grossRevenue * 100 : null })), warnings: ["DRE usa competência e DFC usa caixa. Confirme a classificação antes de importar.", "A projeção considera somente as despesas fixas identificadas; receitas futuras não são inventadas."] };
}
function transactions(text: string) {
  const datePattern = /(\d{2}[\/-]\d{2}[\/-]\d{4}|\d{4}-\d{2}-\d{2})/;
  return text.split(/\r?\n/).flatMap((raw) => {
    const date = raw.match(datePattern), values = raw.match(MONEY); if (!date || !values?.length) return [];
    const parts = date[1].includes("-") ? date[1].split("-") : date[1].split(/[\/-]/).reverse(); const value = amount(values.at(-1) ?? ""); if (!Number.isFinite(value) || value === 0) return [];
    const description = raw.replace(date[0], "").replace(MONEY, "").replace(/\s+/g, " ").trim() || "Lançamento importado";
    const group = groupFor(description), kind = kindFor(description, value, group);
    return [{ date: `${parts[0]}-${parts[1]}-${parts[2]}`, description, amount: Math.abs(value), kind, category: group === "RECEITA" ? "Receita" : group }];
  }).slice(0, 200);
}

function extractDocxText(buffer: Buffer) {
  const searchStart = Math.max(0, buffer.length - 65_557);
  let endRecord = -1;
  for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { endRecord = offset; break; }
  }
  if (endRecord < 0) throw new Error("O arquivo Word não contém uma estrutura DOCX válida.");

  const entryCount = buffer.readUInt16LE(endRecord + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(endRecord + 16);
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Não foi possível ler a estrutura do arquivo Word.");
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (name === "word/document.xml") {
      if (compressedSize > 10 * 1024 * 1024 || buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error("O documento Word é inválido ou grande demais para leitura.");
      }
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      const xml = compression === 0
        ? compressed.toString("utf8")
        : compression === 8
          ? inflateRawSync(compressed, { maxOutputLength: 20 * 1024 * 1024 }).toString("utf8")
          : "";
      if (!xml) throw new Error("Este documento Word usa um formato de compactação não compatível.");
      return xml
        .replace(/<w:tab\b[^>]*\/>/g, "\t")
        .replace(/<\/w:tc>/g, "\t")
        .replace(/<\/w:tr>|<\/w:p>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("Não encontramos texto principal dentro deste arquivo Word.");
}

export async function POST(request: Request) {
  const formData = await request.formData(), file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um arquivo PDF, Excel ou Word (.docx)." }, { status: 400 });
  const extension = file.name.toLowerCase().split(".").pop();
  const isPdf = extension === "pdf" || file.type === "application/pdf";
  const isSheet = extension === "xlsx" || extension === "xls";
  const isWord = extension === "docx";
  if (!isPdf && !isSheet && !isWord) return NextResponse.json({ error: "Formato não compatível. Envie PDF, Excel (.xlsx/.xls) ou Word (.docx)." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "O arquivo deve ter no máximo 10 MB." }, { status: 413 });
  const buffer = Buffer.from(await file.arrayBuffer()); let text = "", pages = 0;
  if (isSheet) {
    try {
      const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
      text = workbook.SheetNames.map((sheet) => XLSX.utils.sheet_to_csv(workbook.Sheets[sheet])).join("\n");
    } catch {
      return NextResponse.json({ error: "Não foi possível abrir esta planilha. Confira se o arquivo Excel não está protegido ou corrompido." }, { status: 422 });
    }
  } else if (isWord) {
    try { text = extractDocxText(buffer); }
    catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Não foi possível ler este documento Word." }, { status: 422 }); }
  } else {
    const parser = new PDFParse({ data: buffer });
    try { const result = await parser.getText(); text = result.text.trim(); pages = result.total; }
    catch { return NextResponse.json({ error: "Não foi possível abrir este PDF. Confira se o arquivo está íntegro e tente exportá-lo novamente." }, { status: 422 }); }
    finally { await parser.destroy(); }
    if (!text) return NextResponse.json({ error: "Este PDF não contém texto selecionável. Se ele foi digitalizado como imagem, salve uma versão com OCR ou exporte o relatório novamente para PDF." }, { status: 422 });
  }
  if (!text) return NextResponse.json({ error: "O arquivo foi aberto, mas não encontramos texto para analisar." }, { status: 422 });
  const lines = linesFrom(text); return NextResponse.json({ fileName: file.name, pages, text, transactions: transactions(text), analysis: analysis(lines) });
}
