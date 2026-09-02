import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

type Kind = "INCOME" | "EXPENSE";
type Group = "RECEITA" | "IMPOSTO" | "CMV" | "RH" | "ADMINISTRATIVA" | "VENDAS" | "FINANCEIRA" | "INVESTIMENTO" | "NAO_OPERACIONAL" | "OUTROS";
type Line = { name: string; amount: number; group: Group; fixedness: "FIXO" | "VARIAVEL" | "MISTO" | "NAO_CLASSIFICADO"; total: boolean };
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
  if (/investimento|equipamento|imobilizado|aquisicao/.test(v)) return "INVESTIMENTO";
  if (/nao operacional|extraordinari|indenizacao/.test(v)) return "NAO_OPERACIONAL";
  if (/receita|venda|faturamento|revenda|delivery|recebimento|cliente/.test(v)) return "RECEITA";
  return "OUTROS";
}
function fixedness(group: Group): Line["fixedness"] { return group === "CMV" || group === "IMPOSTO" ? "VARIAVEL" : group === "RH" || group === "ADMINISTRATIVA" ? "FIXO" : group === "VENDAS" ? "MISTO" : "NAO_CLASSIFICADO"; }
function linesFrom(text: string): Line[] {
  return text.split(/\r?\n/).flatMap((raw) => {
    const values = raw.match(MONEY); if (!values?.length) return [];
    const name = raw.replace(MONEY, "").replace(/[|;]+/g, " ").replace(/\s+/g, " ").trim();
    const value = amount(values.at(-1) ?? ""); if (!name || !Number.isFinite(value) || value === 0) return [];
    const group = groupFor(name);
    return [{ name, amount: Math.abs(value), group, fixedness: fixedness(group), total: /total|lucro|resultado|margem|receita liquida|fluxo de caixa/i.test(normalized(name)) }];
  }).slice(0, 500);
}
function sum(lines: Line[], group: Group) { return lines.filter((line) => line.group === group && !line.total).reduce((total, line) => total + line.amount, 0); }
function named(lines: Line[], matcher: RegExp) { return lines.find((line) => matcher.test(normalized(line.name)))?.amount; }
function analysis(lines: Line[]) {
  const grossRevenue = named(lines, /receita bruta|faturamento bruto/) ?? sum(lines, "RECEITA");
  const taxes = named(lines, /impostos? sobre a receita|deduc.*receita/) ?? sum(lines, "IMPOSTO");
  const netRevenue = named(lines, /receita liquida/) ?? grossRevenue - taxes;
  const cmv = named(lines, /\bcmv\b|custo.*mercadoria|custos? variaveis/) ?? sum(lines, "CMV");
  const grossProfit = named(lines, /lucro bruto/) ?? netRevenue - cmv;
  const operatingExpenses = sum(lines, "RH") + sum(lines, "ADMINISTRATIVA") + sum(lines, "VENDAS");
  const financialResult = sum(lines, "FINANCEIRA"), nonOperatingResult = sum(lines, "NAO_OPERACIONAL");
  const netProfit = named(lines, /lucro liquido|resultado liquido/) ?? grossProfit - operatingExpenses - financialResult - nonOperatingResult;
  const operationalCashFlow = grossRevenue - taxes - cmv - operatingExpenses - financialResult;
  return { detected: lines.length > 0, planOfAccounts: lines.slice(0, 80), summary: { grossRevenue, taxes, netRevenue, cmv, grossProfit, operatingExpenses, financialResult, nonOperatingResult, netProfit, grossMargin: grossRevenue ? grossProfit / grossRevenue * 100 : null, netMargin: grossRevenue ? netProfit / grossRevenue * 100 : null, cashIn: grossRevenue, cashOut: taxes + cmv + operatingExpenses + financialResult + nonOperatingResult, operationalCashFlow, freeCashFlow: operationalCashFlow - sum(lines, "INVESTIMENTO") - nonOperatingResult, projectedFixedOutflow: sum(lines, "RH") + sum(lines, "ADMINISTRATIVA") }, verticalAnalysis: lines.filter((line) => !line.total).slice(0, 30).map((line) => ({ ...line, percentOfRevenue: grossRevenue ? line.amount / grossRevenue * 100 : null })), warnings: ["DRE usa competência e DFC usa caixa. Confirme a classificação antes de importar.", "A projeção considera somente as despesas fixas identificadas; receitas futuras não são inventadas."] };
}
function transactions(text: string) {
  const datePattern = /(\d{2}[\/-]\d{2}[\/-]\d{4}|\d{4}-\d{2}-\d{2})/;
  return text.split(/\r?\n/).flatMap((raw) => {
    const date = raw.match(datePattern), values = raw.match(MONEY); if (!date || !values?.length) return [];
    const parts = date[1].includes("-") ? date[1].split("-") : date[1].split(/[\/-]/).reverse(); const value = amount(values.at(-1) ?? ""); if (!Number.isFinite(value) || value === 0) return [];
    const description = raw.replace(date[0], "").replace(MONEY, "").replace(/\s+/g, " ").trim() || "Lançamento importado";
    const group = groupFor(description), kind: Kind = value < 0 || group !== "RECEITA" ? "EXPENSE" : "INCOME";
    return [{ date: `${parts[0]}-${parts[1]}-${parts[2]}`, description, amount: Math.abs(value), kind, category: group === "RECEITA" ? "Receita" : group }];
  }).slice(0, 200);
}
export async function POST(request: Request) {
  const formData = await request.formData(), file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Envie um arquivo PDF." }, { status: 400 });
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"), isSheet = /\.xlsx?$/i.test(file.name);
  if (!isPdf && !isSheet) return NextResponse.json({ error: "Envie um arquivo PDF ou Excel (.xlsx/.xls)." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "O arquivo deve ter no máximo 10 MB." }, { status: 413 });
  const buffer = Buffer.from(await file.arrayBuffer()); let text = "", pages = 0;
  if (isSheet) { const workbook = XLSX.read(buffer, { type: "buffer" }); text = workbook.SheetNames.map((sheet) => XLSX.utils.sheet_to_csv(workbook.Sheets[sheet])).join("\n"); }
  else { const parser = new PDFParse({ data: buffer }); try { const result = await parser.getText(); text = result.text.trim(); pages = result.total; } catch { return NextResponse.json({ error: "Não foi possível ler este PDF." }, { status: 422 }); } finally { await parser.destroy(); } }
  const lines = linesFrom(text); return NextResponse.json({ fileName: file.name, pages, text, transactions: transactions(text), analysis: analysis(lines) });
}
