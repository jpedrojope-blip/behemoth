import { NextResponse } from "next/server";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";
import { inflateRawSync } from "node:zlib";
import { userFromRequest } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

type Kind = "INCOME" | "EXPENSE";
type Group = "RECEITA" | "IMPOSTO" | "CMV" | "RH" | "ADMINISTRATIVA" | "VENDAS" | "FINANCEIRA" | "INVESTIMENTO" | "NAO_OPERACIONAL" | "FINANCIAMENTO" | "OUTROS";
type Line = { name: string; amount: number; kind: Kind; group: Group; fixedness: "FIXO" | "VARIAVEL" | "MISTO" | "NAO_CLASSIFICADO"; total: boolean; dreEligible: boolean; cashEligible: boolean };
type ImportedTransaction = {
  date: string;
  description: string;
  amount: number;
  kind: Kind;
  category: string;
  accountCode?: string;
  financialReport: "BOTH" | "DRE" | "DFC";
  competenceDate?: string;
  cashDate?: string;
  costBehavior?: "AUTO" | "FIXED" | "VARIABLE";
};
const MONEY = /(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})*,\d{2}|(?:R\$\s*)?-?\d+(?:\.\d{2})/g;

function normalized(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim(); }
function amount(value: string) { const clean = value.replace(/R\$\s*/g, "").trim(); return Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean); }
function signedLineAmount(raw: string, matched: string) {
  const value = amount(matched);
  const prefix = raw.slice(0, raw.lastIndexOf(matched));
  return /[−–—-]\s*(?:R\$\s*)?$/.test(prefix) ? -Math.abs(value) : value;
}
function groupFor(name: string): Group {
  const v = normalized(name);
  if (/manutenc|repar|conserto|reparo/.test(v)) return "OUTROS";
  if (/imposto|simples( nacional)?|icms|iss\b|pis\b|cofins|tribut/.test(v)) return "IMPOSTO";
  if (/cmv|custo da mercadoria|fornecedor|insumo|embalagem|compra para revenda/.test(v)) return "CMV";
  if (/salario|folha|fgts|pro.?labore|vale transporte|beneficio|rh\b/.test(v)) return "RH";
  if (/aluguel|luz|energia|agua|telefone|internet|contador|contabil|assessoria|administrativ/.test(v)) return "ADMINISTRATIVA";
  if (/combustivel|design|maquininha|comissao|marketing|frete/.test(v)) return "VENDAS";
  if (/juros|tarifas? bancaria|taxas? bancaria|rendimento|aplicacao financeira|financeir/.test(v)) return "FINANCEIRA";
  if (/divida|aporte.*soci|dividendo|emprestimo|financiamento/.test(v)) return "FINANCIAMENTO";
  if (/investimento|imobilizado|obra estrutural|capex|(?:aquisicao|compra) de (?:equipamento|imobilizado)|compra.*(?:maquina|veiculo)/.test(v)) return "INVESTIMENTO";
  if (/nao operacional|extraordinari|indenizacao/.test(v)) return "NAO_OPERACIONAL";
  if (/\bvd(?:[-\s]?\d+)?\b|receita|venda|faturamento|revenda|delivery|recebimento|cliente/.test(v)) return "RECEITA";
  return "OUTROS";
}
function fixedness(group: Group): Line["fixedness"] { return group === "CMV" || group === "IMPOSTO" ? "VARIAVEL" : group === "RH" || group === "ADMINISTRATIVA" ? "FIXO" : group === "VENDAS" ? "MISTO" : "NAO_CLASSIFICADO"; }
function kindFor(name: string, value: number, group: Group): Kind {
  if (value < 0) return "EXPENSE";
  if (/lucro liquido|lucro bruto|resultado financeiro|resultado operacional|resultado nao operacional|resultado liquido/.test(normalized(name))) return "INCOME";
  if (group === "RECEITA") return "INCOME";
  if ((group === "FINANCEIRA" || group === "NAO_OPERACIONAL" || group === "FINANCIAMENTO") && /receita|rendimento|aporte|aumento de divida|aumento divida/.test(normalized(name))) return "INCOME";
  return "EXPENSE";
}
function isAggregateName(name: string) {
  const value = normalized(name).replace(/^[^a-z0-9]+/, "").replace(/\s+/g, " ").trim();
  return /^(?:total|subtotal|receita bruta(?: total)?|faturamento bruto|receita liquida|lucro bruto|lucro liquido|resultado liquido|resultado operacional|resultado financeiro|resultado nao operacional|despesas? operacionais|custos? operacionais|fluxo de caixa(?: livre)?|margem(?: bruta| liquida| operacional)?|resultado do periodo)(?:\b|$)/i.test(value);
}
function linesFrom(text: string): Line[] {
  return text.split(/\r?\n/).flatMap((raw) => {
    const values = raw.match(MONEY); if (!values?.length) return [];
    const name = raw.replace(MONEY, "").replace(/[|;]+/g, " ").replace(/\s+/g, " ").trim();
    const value = signedLineAmount(raw, values.at(-1) ?? ""); if (!name || !Number.isFinite(value) || value === 0) return [];
    const group = groupFor(name);
    return [{ name, amount: Math.abs(value), kind: kindFor(name, value, group), group, fixedness: fixedness(group), total: isAggregateName(name), dreEligible: true, cashEligible: false }];
  }).slice(0, 500);
}
function sum(lines: Line[], group: Group, kind?: Kind) { return lines.filter((line) => line.group === group && !line.total && (!kind || line.kind === kind)).reduce((total, line) => total + line.amount, 0); }
function named(lines: Line[], matcher: RegExp) { return lines.find((line) => line.total && matcher.test(normalized(line.name)))?.amount; }
function analysis(lines: Line[]) {
  const dreLines = lines.filter((line) => line.dreEligible);
  const detailLines = dreLines.filter((line) => !line.total);
  const hasDetailRows = detailLines.length > 0;
  const revenueDetails = sum(dreLines, "RECEITA", "INCOME");
  const grossRevenue = revenueDetails || named(dreLines, /receita bruta|faturamento bruto/) || 0;
  const taxDetails = sum(dreLines, "IMPOSTO", "EXPENSE");
  const taxes = taxDetails || named(dreLines, /impostos? sobre a receita|deduc.*receita|impostos?/) || 0;
  const netRevenue = revenueDetails || taxDetails ? grossRevenue - taxes : named(dreLines, /receita liquida/) ?? grossRevenue - taxes;
  const cmvDetails = sum(dreLines, "CMV", "EXPENSE");
  const cmv = cmvDetails || named(dreLines, /\bcmv\b|custo.*mercadoria|custos? variaveis/) || 0;
  const grossProfit = (revenueDetails || taxDetails || cmvDetails)
    ? netRevenue - cmv
    : named(dreLines, /lucro bruto/) ?? netRevenue - cmv;
  const operatingDetailRows = detailLines.filter((line) => ["RH", "ADMINISTRATIVA", "VENDAS", "OUTROS"].includes(line.group) && line.kind === "EXPENSE");
  const operatingExpenses = operatingDetailRows.length
    ? operatingDetailRows.reduce((total, line) => total + line.amount, 0)
    : named(dreLines, /despesas? operacionais/) ?? 0;
  const financialIncome = sum(dreLines, "FINANCEIRA", "INCOME"), financialExpense = sum(dreLines, "FINANCEIRA", "EXPENSE");
  const nonOperatingIncome = sum(dreLines, "NAO_OPERACIONAL", "INCOME"), nonOperatingExpense = sum(dreLines, "NAO_OPERACIONAL", "EXPENSE");
  const financialDetails = sum(dreLines, "FINANCEIRA");
  const nonOperatingDetails = sum(dreLines, "NAO_OPERACIONAL");
  const signedSummary = (matcher: RegExp) => {
    const row = dreLines.find((line) => line.total && matcher.test(normalized(line.name)));
    return row ? (row.kind === "EXPENSE" ? -row.amount : row.amount) : null;
  };
  const financialResult = financialDetails ? financialIncome - financialExpense : signedSummary(/resultado financeiro/) ?? 0;
  const nonOperatingResult = nonOperatingDetails ? nonOperatingIncome - nonOperatingExpense : signedSummary(/resultado nao operacional/) ?? 0;
  const operationalResult = grossProfit - operatingExpenses;
  const netProfit = hasDetailRows
    ? operationalResult + financialResult + nonOperatingResult
    : signedSummary(/lucro liquido|resultado liquido/) ?? operationalResult + financialResult + nonOperatingResult;
  const investments = sum(dreLines, "INVESTIMENTO", "EXPENSE"), financingIn = sum(dreLines, "FINANCIAMENTO", "INCOME"), financingOut = sum(dreLines, "FINANCIAMENTO", "EXPENSE");
  const cashLines = lines.filter((line) => line.cashEligible && !line.total);
  const cashIn = cashLines.filter((line) => line.kind === "INCOME").reduce((total, line) => total + line.amount, 0);
  const cashOut = cashLines.filter((line) => line.kind === "EXPENSE").reduce((total, line) => total + line.amount, 0);
  const freeCashFlow = cashLines.length ? cashIn - cashOut : null;
  const projectedFixedOutflow = detailLines.filter((line) => line.kind === "EXPENSE" && line.fixedness === "FIXO").reduce((total, line) => total + line.amount, 0);
  const warnings = ["DRE usa competência e DFC usa caixa. Revise a classificação de cada lançamento antes de importar."];
  if (!cashLines.length) warnings.push("Não há lançamentos com data de liquidação confirmada; a DRE não foi usada para estimar fluxo de caixa.");
  warnings.push("Os valores de resumo servem como referência quando não há linhas detalhadas; confira eventuais diferenças antes de confirmar.");
  const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  const reconciliationRows: Array<{ label: string; detailed: number; summary: number | null | undefined }> = [
    { label: "Receita bruta", detailed: revenueDetails, summary: named(dreLines, /receita bruta|faturamento bruto/) },
    { label: "Impostos", detailed: taxDetails, summary: named(dreLines, /impostos? sobre a receita|deduc.*receita|total.*impostos?/) },
    { label: "CMV", detailed: cmvDetails, summary: named(dreLines, /\bcmv\b|custo.*mercadoria|custos? variaveis/) },
    { label: "Despesas operacionais", detailed: operatingDetailRows.reduce((total, line) => total + line.amount, 0), summary: named(dreLines, /despesas? operacionais/) },
    { label: "Lucro líquido", detailed: operationalResult + financialResult + nonOperatingResult, summary: signedSummary(/lucro liquido|resultado liquido/) },
  ];
  for (const row of reconciliationRows) {
    if (!row.detailed || row.summary === null || row.summary === undefined || Math.abs(Math.abs(row.summary) - row.detailed) < 0.01) continue;
    warnings.push(`${row.label}: os lançamentos detalhados somam ${money(row.detailed)}, enquanto o resumo do arquivo informa ${money(Math.abs(row.summary))}. Revise a conciliação.`);
  }
  return { detected: lines.length > 0, planOfAccounts: lines.slice(0, 80), summary: { grossRevenue, taxes, netRevenue, cmv, grossProfit, operatingExpenses, financialIncome, financialExpense, financialResult, nonOperatingIncome, nonOperatingExpense, nonOperatingResult, investments, financingIn, financingOut, netProfit, grossMargin: netRevenue ? grossProfit / netRevenue * 100 : null, netMargin: netRevenue ? netProfit / netRevenue * 100 : null, cashIn, cashOut, operationalCashFlow: null, freeCashFlow, projectedFixedOutflow }, verticalAnalysis: detailLines.slice(0, 30).map((line) => ({ ...line, percentOfRevenue: grossRevenue ? line.amount / grossRevenue * 100 : null })), warnings };
}
function transactions(text: string): ImportedTransaction[] {
  const datePattern = /(\d{2}[\/-]\d{2}[\/-]\d{4}|\d{4}-\d{2}-\d{2})/;
  return text.split(/\r?\n/).flatMap((raw) => {
    const date = raw.match(datePattern), values = raw.match(MONEY); if (!date || !values?.length) return [];
    const parsedDate = toIsoDate(date[1]);
    const value = signedLineAmount(raw, values.at(-1) ?? "");
    if (!parsedDate || !Number.isFinite(value) || value === 0) return [];
    const description = raw.replace(date[0], "").replace(MONEY, "").replace(/\s+/g, " ").trim() || "Lançamento importado";
    if (isAggregateName(description)) return [];
    const group = groupFor(description), kind = kindFor(description, value, group);
    return [{ date: parsedDate, competenceDate: parsedDate, description, amount: Math.abs(value), kind, category: group === "RECEITA" ? "Receita" : group, financialReport: "DRE" as const }];
  }).slice(0, 10_000);
}

function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = XLSX.SSF.parse_date_code(value);
    if (date?.y && date.m && date.d) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const br = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return null;
}

function valueAsNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/R\$\s*/g, "").replace(/\s/g, "");
  if (!cleaned) return null;
  const parsed = amount(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function reportFor(value: unknown): ImportedTransaction["financialReport"] {
  const text = normalized(String(value ?? ""));
  const includesDre = text.includes("dre") || text.includes("demonstracao de resultado");
  const includesCash = text.includes("dfc") || text.includes("fluxo de caixa") || /\bcaixa\b/.test(text);
  if ((includesDre && includesCash) || text.includes("both") || text.includes("ambos") || text.includes("ambas")) return "BOTH";
  if (includesDre) return "DRE";
  if (includesCash) return "DFC";
  return "DRE";
}

function behaviorFor(group: Group): ImportedTransaction["costBehavior"] {
  if (group === "CMV" || group === "IMPOSTO") return "VARIABLE";
  if (group === "RH" || group === "ADMINISTRATIVA") return "FIXED";
  if (group === "VENDAS") return "AUTO";
  return undefined;
}

function groupForAccountCode(value: unknown, fallback: string): Group {
  const code = String(value ?? "").trim().replace(/,/g, ".");
  if (/^1(?:\.|$)/.test(code)) return "RECEITA";
  if (/^2(?:\.|$)/.test(code)) return "IMPOSTO";
  if (/^3(?:\.|$)/.test(code)) return "CMV";
  if (/^4\.(?:0?1)(?:\.|$)/.test(code)) return "RH";
  if (/^4\.(?:0?2)(?:\.|$)/.test(code)) return "ADMINISTRATIVA";
  if (/^4\.(?:0?3)(?:\.|$)/.test(code)) return "VENDAS";
  if (/^4(?:\.|$)/.test(code)) return "ADMINISTRATIVA";
  if (/^5(?:\.|$)/.test(code)) return "FINANCEIRA";
  if (/^6(?:\.|$)/.test(code)) return "NAO_OPERACIONAL";
  if (/^7(?:\.|$)/.test(code)) return "INVESTIMENTO";
  if (/^8(?:\.|$)/.test(code)) return "FINANCIAMENTO";
  return groupFor(fallback);
}

function behaviorForAccountCode(value: unknown, group: Group): ImportedTransaction["costBehavior"] {
  const code = String(value ?? "").trim().replace(/,/g, ".");
  if (/^2(?:\.|$)|^3(?:\.|$)|^4\.0?3(?:\.|$)/.test(code)) return "VARIABLE";
  if (/^4\.0?[12](?:\.|$)/.test(code)) return "FIXED";
  return behaviorFor(group);
}

function headerColumns(row: unknown[]) {
  const cells = row.map((value) => normalized(String(value ?? "").trim()));
  const find = (pattern: RegExp) => cells.findIndex((cell) => pattern.test(cell));
  return {
    description: find(/descri.*item|historico|memo|description|favorecido|beneficiario/),
    category: find(/^categoria$|^descricao plano de contas$|^categoria contabil$|^descricao categoria$/),
    accountCode: find(/^plano de contas$|^codigo.*conta$/),
    amount: find(/^(valor|amount|montante|total liquido|valor total)\b/),
    competence: find(/competencia|data.*competencia/),
    cash: find(/data.*(pagamento|recebimento|caixa)|^(pagamento|recebimento)$/),
    date: find(/^(data|data lancamento|date|dia)$/),
    report: find(/^classificacao$|relatorio financeiro/),
    kind: find(/^(tipo|natureza|movimentacao)$/),
  };
}

function parseWorkbookTransactions(buffer: Buffer, isCsv = false) {
  const workbook = isCsv
    ? XLSX.read(buffer.toString("utf8"), { type: "string", cellDates: true })
    : XLSX.read(buffer, { type: "buffer", cellDates: true });
  const rows: ImportedTransaction[] = [];
  const warnings: string[] = [];
  let recognizedSheets = 0;
  let missingReportColumn = false;
  let rowsWithoutReportClassification = 0;
  let bothWithoutCashDate = 0;
  let uncategorizedRows = 0;
  for (const sheetName of workbook.SheetNames) {
    const normalizedSheet = normalized(sheetName);
    const isIncomeSheet = /^(entradas?|receitas?)$/.test(normalizedSheet);
    const isExpenseSheet = /^(saidas?|despesas?)$/.test(normalizedSheet);
    const isAggregateSheet = /resumo|dre|dfc|av dre|av dfc|fluxo de caixa|plano de contas|cmv/.test(normalizedSheet);
    const data = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });
    let headerIndex = -1;
    let columns: ReturnType<typeof headerColumns> | null = null;
    for (let index = 0; index < Math.min(60, data.length); index += 1) {
      const candidate = headerColumns(data[index] ?? []);
      if (candidate.description >= 0 && candidate.amount >= 0 && (candidate.competence >= 0 || candidate.cash >= 0 || candidate.date >= 0)) {
        headerIndex = index;
        columns = candidate;
        break;
      }
    }
    if (headerIndex < 0 || !columns) continue;
    if (isAggregateSheet && !isIncomeSheet && !isExpenseSheet) continue;
    recognizedSheets += 1;
    if (columns.report < 0) missingReportColumn = true;

    for (const row of data.slice(headerIndex + 1)) {
      const description = String(row[columns.description] ?? "").trim();
      const accountCodeValue = columns.accountCode >= 0 ? row[columns.accountCode] : null;
      const accountCodeText = String(accountCodeValue ?? "").trim();
      const rawCategory = columns.category >= 0 ? row[columns.category] : null;
      const categoryValue = rawCategory ?? (accountCodeText && !/^\d+(?:\.\d+)*$/.test(accountCodeText) ? accountCodeText : null);
      const value = valueAsNumber(row[columns.amount]);
      const competenceDate = columns.competence >= 0 ? toIsoDate(row[columns.competence]) : null;
      const cashDate = columns.cash >= 0 ? toIsoDate(row[columns.cash]) : null;
      const dateColumn = columns.date >= 0 ? toIsoDate(row[columns.date]) : null;
      const declaredReport = columns.report >= 0 ? reportFor(row[columns.report]) : "DRE";
      const financialReport = declaredReport === "BOTH" && !cashDate ? "DRE" : declaredReport;
      const date = financialReport === "DFC" ? cashDate ?? dateColumn : competenceDate ?? cashDate ?? dateColumn;
      if (!date || !description || !value || isAggregateName(description)) continue;

      const group = groupForAccountCode(accountCodeValue, `${String(categoryValue ?? "")} ${description}`);
      const kindCell = columns.kind >= 0 ? normalized(String(row[columns.kind] ?? "")) : "";
      const sheetKind = isIncomeSheet ? "INCOME" : isExpenseSheet ? "EXPENSE" : null;
      const kind: Kind = value < 0 ? "EXPENSE" : /saida|despesa|debito|expense/.test(kindCell) ? "EXPENSE" : /entrada|receita|credito|income/.test(kindCell) ? "INCOME" : sheetKind ?? kindFor(`${description} ${String(categoryValue ?? "")}`, value, group);
      const category = String(categoryValue ?? "").trim() || (kind === "INCOME" ? "Receita" : group);
      if (group === "OUTROS") uncategorizedRows += 1;
      if (columns.report >= 0 && !/dre|dfc|both|ambos|ambas|caixa/i.test(String(row[columns.report] ?? ""))) rowsWithoutReportClassification += 1;
      if (declaredReport === "BOTH" && !cashDate) bothWithoutCashDate += 1;
      rows.push({
        date,
        ...(competenceDate ? { competenceDate } : {}),
        ...(cashDate ? { cashDate } : {}),
        description,
        amount: Math.abs(value),
        kind,
        category,
        ...(accountCodeText && /^\d+(?:\.\d+)*$/.test(accountCodeText) ? { accountCode: accountCodeText } : {}),
        financialReport,
        ...(kind === "EXPENSE" && behaviorForAccountCode(accountCodeValue, group) ? { costBehavior: behaviorForAccountCode(accountCodeValue, group) } : {}),
      });
      if (rows.length >= 10_000) break;
    }
    if (rows.length >= 10_000) break;
  }
  if (!recognizedSheets) warnings.push("Não encontramos uma tabela com descrição, data e valor. Planilhas de resumo sem lançamentos detalhados não são importadas como transações.");
  if (rows.length >= 10_000) warnings.push("O arquivo excede o limite de segurança de 10.000 lançamentos; os demais não foram incluídos.");
  if (missingReportColumn || rowsWithoutReportClassification) warnings.push("Classificação DRE/DFC ausente em algumas linhas: elas foram encaminhadas somente à DRE até você revisá-las.");
  if (bothWithoutCashDate) warnings.push(`${bothWithoutCashDate} lançamento(s) marcados para DRE e caixa não tinham data de liquidação; foram mantidos somente na DRE para não presumir movimentação de caixa.`);
  if (uncategorizedRows) warnings.push(`${uncategorizedRows} lançamento(s) ficaram em “Outros” porque a categoria não pôde ser reconhecida; revise antes de usar os indicadores de custos e margens.`);
  if (workbook.SheetNames.some((name) => /cmv/i.test(name))) warnings.push("A aba CMV com custo e markup por produto foi detectada, mas o cadastro de produtos ainda não é importado; só as linhas detalhadas de Entradas e Saídas viram lançamentos.");
  if (recognizedSheets) warnings.push("Revise a classificação e as categorias antes de confirmar; depois, Início e Finanças recalculam os indicadores a partir dos lançamentos salvos.");
  return { transactions: rows, warnings };
}

function linesFromTransactions(items: ImportedTransaction[]): Line[] {
  return items.map((item) => {
    const group = groupForAccountCode(item.accountCode, `${item.category} ${item.description}`);
    return {
      name: item.description || item.category,
      amount: item.amount,
      kind: item.kind,
      group,
      fixedness: fixedness(group),
      total: false,
      dreEligible: item.financialReport !== "DFC",
      cashEligible: item.financialReport === "DFC" || (item.financialReport === "BOTH" && Boolean(item.cashDate)),
    };
  });
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
  try {
    if (!(await userFromRequest(request))) return NextResponse.json({ error: "Entre na sua conta para importar dados financeiros." }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Não foi possível validar sua sessão. Entre novamente." }, { status: 503 });
  }
  const formData = await request.formData(), file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um arquivo PDF, Excel, CSV ou Word (.docx)." }, { status: 400 });
  const extension = file.name.toLowerCase().split(".").pop();
  const isPdf = extension === "pdf" || file.type === "application/pdf";
  const isCsv = extension === "csv";
  const isSheet = extension === "xlsx" || extension === "xls" || isCsv;
  const isWord = extension === "docx";
  if (!isPdf && !isSheet && !isWord) return NextResponse.json({ error: "Formato não compatível. Envie PDF, Excel (.xlsx/.xls), CSV ou Word (.docx)." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "O arquivo deve ter no máximo 10 MB." }, { status: 413 });
  const buffer = Buffer.from(await file.arrayBuffer()); let text = "", pages = 0;
  let parsedTransactions: ImportedTransaction[] = [];
  let warnings: string[] = [];
  if (isSheet) {
    try {
      const parsed = parseWorkbookTransactions(buffer, isCsv);
      parsedTransactions = parsed.transactions;
      warnings = parsed.warnings;
    } catch {
      return NextResponse.json({ error: isCsv ? "Não foi possível interpretar este CSV. Confira os cabeçalhos e a codificação do arquivo." : "Não foi possível abrir esta planilha. Confira se o arquivo Excel não está protegido ou corrompido." }, { status: 422 });
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
  if (!text && !isSheet) return NextResponse.json({ error: "O arquivo foi aberto, mas não encontramos texto para analisar." }, { status: 422 });
  if (!isSheet) parsedTransactions = transactions(text);
  if (parsedTransactions.length >= 10_000 && !warnings.some((warning) => warning.includes("10.000"))) {
    warnings.push("O arquivo excede o limite de segurança de 10.000 lançamentos; os demais não foram incluídos.");
  }
  const lines = isSheet ? linesFromTransactions(parsedTransactions) : linesFrom(text);
  const financialAnalysis = analysis(lines);
  financialAnalysis.warnings.push(...warnings);
  if (!isSheet && parsedTransactions.length) {
    financialAnalysis.warnings.push("PDF/Word: os lançamentos foram classificados somente na DRE; o caixa não é presumido sem uma data de liquidação.");
  }
  return NextResponse.json({ fileName: file.name, pages, transactions: parsedTransactions, analysis: financialAnalysis });
}
