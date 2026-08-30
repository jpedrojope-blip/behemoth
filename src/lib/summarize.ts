const DECISION_KEYWORDS = [
  "decid",
  "vamos",
  "precisa",
  "próximo passo",
  "proximo passo",
  "responsáv",
  "responsav",
  "prazo",
  "até ",
  "ficou de",
  "acordado",
  "aprovad",
  "meta",
  "resultado",
];

const ACTION_KEYWORDS = ["vamos", "precisa", "ficou de", "próximo passo", "proximo passo", "responsáv", "responsav", "prazo"];

function sentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 12);
}

function score(sentence: string) {
  const lower = sentence.toLowerCase();
  return DECISION_KEYWORDS.reduce((total, keyword) => (lower.includes(keyword) ? total + 1 : total), 0);
}

function stripSpeaker(sentence: string) {
  return sentence.replace(/^[A-ZÀ-Ú][\wÀ-ú.\s]{1,24}:\s*/, "");
}

/**
 * Resumo extrativo local — não depende de provedor de IA externo.
 * Quando AI_PROVIDER estiver configurado, esta função é o fallback.
 */
export function summarizeMeeting(notes: string, transcript: string) {
  const pool = [...sentences(notes), ...sentences(transcript)].map(stripSpeaker);
  if (!pool.length) {
    return { summary: "", actionItems: [] as { title: string }[], generatedBy: "local" as const };
  }

  const ranked = pool
    .map((sentence, index) => ({ sentence, index, weight: score(sentence) }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);

  const summary = ranked
    .slice(0, 3)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.sentence)
    .join(" ");

  const actionItems = pool
    .filter((sentence) => ACTION_KEYWORDS.some((keyword) => sentence.toLowerCase().includes(keyword)))
    .slice(0, 5)
    .map((sentence) => ({ title: sentence.length > 90 ? `${sentence.slice(0, 87)}...` : sentence }));

  return { summary, actionItems, generatedBy: "local" as const };
}
