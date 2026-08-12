export type ReceiptProductCandidate = {
  id: string;
  name: string;
  canonicalName?: string | null;
  brand?: string | null;
  packSize?: string | null;
  aliases?: string[];
  retailerNames?: string[];
};

export type ReceiptProductMatch = {
  productId: string;
  name: string;
  confidence: number;
};

const noise = new Set(["the", "and", "for", "each", "with", "pack", "pk", "gram", "grams", "litre", "litres"]);

function normalise(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/&/g, " and ").replace(/[^a-z0-9.]+/g, " ").replace(/\s+/g, " ").trim();
}

function pack(value: string) {
  const packText = normalise(value)
    .replace(/\bs(?=\d{2,}\s*(?:ml|g)\b)/g, "5")
    .replace(/(?<=\d)s(?=\d)/g, "5").replace(/(?<=\d)o(?=\d)/g, "0")
    .replace(/\b(\d+)\s+(\d{1,2})\s*(litres?|l)\b/g, "$1.$2$3");
  const match = packText.match(/(\d+(?:\.\d+)?)\s*(kg|g|grams?|litres?|l|ml|pack|pk)\b/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "kg") return `${amount * 1000}g`;
  if (unit === "l" || unit.startsWith("litre")) return `${amount * 1000}ml`;
  if (unit === "gram" || unit === "grams") return `${amount}g`;
  if (unit === "pk") return `${amount}pack`;
  return `${amount}${unit}`;
}

function tokens(value: string) {
  const cleaned = normalise(value)
    .replace(/^\s*\d+(?=[a-z])/, "")
    .replace(/^\s*(?:\d+[a-z]?|[a-z]{1,2})\s+(?=[a-z0-9]*[a-z][a-z0-9]*\s)/i, "")
    .replace(/(?<=[a-z])1(?=[a-z])/g, "i");
  return cleaned.split(" ").filter((token) => token.length > 1 && !noise.has(token) && !/^\d/.test(token));
}

function distance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0]; previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + (left[row - 1] === right[column - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}

function similarity(left: string, right: string) {
  if (left === right) return 1;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length >= 4 && longer.startsWith(shorter)) return .8;
  return 1 - distance(left, right) / Math.max(left.length, right.length);
}

function packScore(ocrPack: string, candidatePack: string) {
  if (ocrPack === candidatePack) return .16;
  const ocrMatch = ocrPack.match(/^(\d+)(g|ml|pack)$/);
  const candidateMatch = candidatePack.match(/^(\d+)(g|ml|pack)$/);
  if (ocrMatch && candidateMatch && ocrMatch[2] === candidateMatch[2]
    && Math.abs(ocrMatch[1].length - candidateMatch[1].length) <= 1
    && distance(ocrMatch[1], candidateMatch[1]) === 1) {
    // Receipt OCR commonly confuses one digit in dense pack sizes (for example
    // 155g -> 135g). Keep a small positive signal when the product wording is
    // otherwise strong; exact pack-size candidates still outrank this recovery.
    return .04;
  }
  return -.65;
}

function expandedTokens(value: string) {
  const base = tokens(value);
  return [...base, ...base.slice(0, -1).map((token, index) => token + base[index + 1])];
}

function scoreName(ocr: string, candidateName: string) {
  const ocrTokens = expandedTokens(ocr);
  const candidateTokens = tokens(candidateName);
  if (!ocrTokens.length || !candidateTokens.length) return { score: 0, matches: 0 };
  const similarities = candidateTokens.map((candidateToken) => Math.max(...ocrTokens.map((ocrToken) => similarity(ocrToken, candidateToken))));
  const strong = similarities.filter((value) => value >= .72);
  const exact = similarities.filter((value) => value === 1).length;
  const coverage = strong.reduce((sum, value) => sum + value, 0) / candidateTokens.length;
  return { score: coverage + exact * .035, matches: strong.length };
}

export function matchReceiptProduct(ocr: string, candidates: ReceiptProductCandidate[]): ReceiptProductMatch | null {
  const ocrPack = pack(ocr);
  const ranked = candidates.map((candidate) => {
    const names = [candidate.name, candidate.canonicalName, candidate.brand ? `${candidate.brand} ${candidate.canonicalName ?? candidate.name}` : null, ...(candidate.aliases ?? []), ...(candidate.retailerNames ?? [])].filter((value): value is string => Boolean(value));
    const best = names.map((name) => scoreName(ocr, name)).sort((left, right) => right.score - left.score)[0] ?? { score: 0, matches: 0 };
    const candidatePack = pack([candidate.packSize, ...names].filter(Boolean).join(" "));
    let score = best.score;
    if (ocrPack && candidatePack) score += packScore(ocrPack, candidatePack);
    const ocrTerms = expandedTokens(ocr);
    const displayTerms = tokens(candidate.canonicalName ?? candidate.name);
    // The first display token is commonly a catalogue-backed brand/retailer.
    // Later unmatched tokens are product variants (for example Mint) and must
    // never be invented when the receipt did not establish them.
    const unsupportedSpecificity = displayTerms.slice(1).some((term) => !ocrTerms.some((ocrTerm) => similarity(ocrTerm, term) >= .72));
    return { candidate, score, matches: best.matches, unsupportedSpecificity };
  }).filter((entry) => !entry.unsupportedSpecificity).sort((left, right) => right.score - left.score);

  const best = ranked[0];
  const runnerUp = ranked[1];
  if (!best || best.matches < 2 || best.score < .76 || (runnerUp && best.score - runnerUp.score < .1)) return null;
  return { productId: best.candidate.id, name: best.candidate.canonicalName ?? best.candidate.name, confidence: Math.min(1, best.score) };
}
