export function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function brlExact(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function percent(value: number, fractionDigits = 1) {
  return `${value.toFixed(fractionDigits).replace(".", ",")}%`;
}

export function signedPercent(value: number, fractionDigits = 1) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(fractionDigits).replace(".", ",")}%`;
}

export function shortDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year.slice(2)}`;
}

export function weekdayLabel(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}

export function longDate(value: Date) {
  return value.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function compactBrl(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (abs >= 1_000) return `R$ ${Math.round(value / 1_000)} mil`;
  return `R$ ${Math.round(value)}`;
}

/** Escala "bonita" para o eixo Y: 1, 2, 2.5 ou 5 vezes uma potência de 10. */
export function niceScale(max: number, ticks = 4) {
  if (max <= 0) return { max: 100, step: 25 };
  const rawStep = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const step = factor * magnitude;
  return { max: Math.ceil(max / step) * step, step };
}
