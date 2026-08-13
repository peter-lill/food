import type { RetailerCatalogueCandidate } from "../src/lib/prices/coles-woolworths-provider";
import { normaliseProductText } from "../src/lib/products/product-normalisation";

const ignoredTokens = new Set(["coles", "the", "and", "style"]);
const identityGroups = [
  ["coconut", "almond", "oat", "soy"],
  ["full", "light", "skim"],
  ["white", "wholemeal"],
  ["plain", "self", "raising"],
  ["blackcurrant", "honey", "lemon", "orange"],
] as const;
const requiredPhrases = ["lactose free", "free range", "extra virgin", "long grain", "double espresso"];

function words(value: string) {
  return normaliseProductText(value).split(" ").filter(Boolean);
}

function comparablePackSize(value: string) {
  const match = normaliseProductText(value).match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|pack|pk|tablets?|rolls?)/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "kg") return `${amount * 1000}g`;
  if (unit === "l") return `${amount * 1000}ml`;
  if (unit === "pk") return `${amount}pack`;
  if (unit === "tablet" || unit === "tablets") return `${amount}tablets`;
  if (unit === "roll" || unit === "rolls") return `${amount}rolls`;
  return `${amount}${unit}`;
}

function productIdentity(value: string) {
  return normaliseProductText(value)
    .replace(/\bcoles\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|l|ml|pack|pk|tablets?|rolls?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function explainPilotCandidate(query: string, candidate: RetailerCatalogueCandidate): { score: number; rejection: string | null } {
  if (candidate.retailer !== "Coles") return { score: -Infinity, rejection: "not a Coles result" };
  if (!candidate.externalId) return { score: -Infinity, rejection: "missing Coles product ID" };
  if (!candidate.packSize) return { score: -Infinity, rejection: "missing package size" };
  if (candidate.price === null || candidate.price <= 0) return { score: -Infinity, rejection: "missing positive price" };

  const queryText = normaliseProductText(query);
  const candidateText = normaliseProductText(candidate.productName);
  const expectedPack = comparablePackSize(queryText);
  const actualPack = comparablePackSize(candidate.packSize) ?? comparablePackSize(candidateText);
  if (!expectedPack) return { score: -Infinity, rejection: "query package size was not understood" };
  if (expectedPack !== actualPack) return { score: -Infinity, rejection: `package size ${actualPack ?? "unknown"} does not match ${expectedPack}` };

  for (const phrase of requiredPhrases) {
    if (queryText.includes(phrase) && !candidateText.includes(phrase)) return { score: -Infinity, rejection: `missing required phrase: ${phrase}` };
  }
  for (const group of identityGroups) {
    const expected = group.filter((term) => queryText.includes(term));
    const actual = group.filter((term) => candidateText.includes(term));
    const missing = expected.find((term) => !actual.includes(term));
    if (missing) return { score: -Infinity, rejection: `missing required identity: ${missing}` };
    const conflict = actual.find((term) => !expected.includes(term));
    if (conflict) return { score: -Infinity, rejection: `conflicting identity: ${conflict}` };
  }

  const expected = words(queryText).filter((token) => !ignoredTokens.has(token) && !/^(?:\d|kg$|g$|l$|ml$|pack$)/.test(token));
  const actual = new Set(words(candidateText));
  const coverage = expected.filter((token) => actual.has(token)).length / expected.length;
  if (coverage < 0.8) return { score: -Infinity, rejection: `name coverage ${Math.round(coverage * 100)}% is below 80%` };
  const exactIdentity = productIdentity(queryText) === productIdentity(candidateText);
  return { score: coverage * 100 + (exactIdentity ? 30 : 0) + (candidate.barcode ? 5 : 0) + (candidate.imageUrl ? 5 : 0), rejection: null };
}

export function scorePilotCandidate(query: string, candidate: RetailerCatalogueCandidate) {
  return explainPilotCandidate(query, candidate).score;
}
