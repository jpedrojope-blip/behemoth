export const BRAZILIAN_STATE_CODES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export type BrazilianStateCode = (typeof BRAZILIAN_STATE_CODES)[number];

export const BRAZILIAN_STATE_CAPITALS: Record<BrazilianStateCode, string> = {
  AC: "Rio Branco",
  AL: "Maceió",
  AP: "Macapá",
  AM: "Manaus",
  BA: "Salvador",
  CE: "Fortaleza",
  DF: "Brasília",
  ES: "Vitória",
  GO: "Goiânia",
  MA: "São Luís",
  MT: "Cuiabá",
  MS: "Campo Grande",
  MG: "Belo Horizonte",
  PA: "Belém",
  PB: "João Pessoa",
  PR: "Curitiba",
  PE: "Recife",
  PI: "Teresina",
  RJ: "Rio de Janeiro",
  RN: "Natal",
  RS: "Porto Alegre",
  RO: "Porto Velho",
  RR: "Boa Vista",
  SC: "Florianópolis",
  SP: "São Paulo",
  SE: "Aracaju",
  TO: "Palmas",
};

export const BRAZILIAN_STATE_NAMES: Record<BrazilianStateCode, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

export function isBrazilianStateCode(value: string): value is BrazilianStateCode {
  return BRAZILIAN_STATE_CODES.some((code) => code === value);
}

export function legacyStateCode(location: string): BrazilianStateCode | "" {
  const normalized = location.trim().toLocaleUpperCase("pt-BR");
  if (isBrazilianStateCode(normalized)) return normalized;

  const found = BRAZILIAN_STATE_CODES.find((code) => new RegExp(`\\b${code}\\b`).test(normalized));
  if (found) return found;

  const capitalEntry = Object.entries(BRAZILIAN_STATE_CAPITALS).find(([, capital]) =>
    capital.localeCompare(location.trim(), "pt-BR", { sensitivity: "base" }) === 0,
  );
  if (!capitalEntry) return "";
  return capitalEntry[0] as BrazilianStateCode;
}

export function formatTeamLocation(member: {
  location?: string;
  locationState?: BrazilianStateCode | "";
  locationCity?: string;
}) {
  const legacy = member.location?.trim() ?? "";
  const state = member.locationState || legacyStateCode(legacy);
  const city = member.locationCity || (state ? BRAZILIAN_STATE_CAPITALS[state] : "");
  if (!state || !city) return legacy;

  const structured = `${city}, ${state}`;
  const normalizedLegacy = legacy.toLocaleLowerCase("pt-BR");
  if (!legacy || normalizedLegacy === state.toLocaleLowerCase("pt-BR")
    || normalizedLegacy === city.toLocaleLowerCase("pt-BR")) return structured;
  return `${structured} · ${legacy}`;
}

export function formatTeamWorkArrangement(member: { location?: string; locationState?: BrazilianStateCode | ""; locationCity?: string }) {
  const legacy = member.location?.trim() ?? "";
  if (!legacy) return "";
  const state = member.locationState || legacyStateCode(legacy);
  const city = member.locationCity || (state ? BRAZILIAN_STATE_CAPITALS[state] : "");
  const normalized = legacy.toLocaleLowerCase("pt-BR");
  if (state && normalized === state.toLocaleLowerCase("pt-BR")) return "";
  if (city && normalized === city.toLocaleLowerCase("pt-BR")) return "";
  return legacy;
}
