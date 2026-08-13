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

export function scorePilotCandidate(query: string, candidate: RetailerCatalogueCandidate) {
  if (candidate.retailer !== "Coles" || !candidate.externalId || !candidate.packSize || candidate.price === null || candidate.price <= 0) return -Infinity;

  const queryText = normaliseProductText(query);
  const candidateText = normaliseProductText(candidate.productName);
  const expectedPack = comparablePackSize(queryText);
  const actualPack = comparablePackSize(candidate.packSize) ?? comparablePackSize(candidateText);
  if (!expectedPack || expectedPack !== actualPack) return -Infinity;

  for (const phrase of requiredPhrases) {
    if (queryText.includes(phrase) && !candidateText.includes(phrase)) return -Infinity;
  }
  for (const group of identityGroups) {
    const expected = group.filter((term) => queryText.includes(term));
    const actual = group.filter((term) => candidateText.includes(term));
    if (expected.some((term) => !actual.includes(term))) return -Infinity;
    if (actual.some((term) => !expected.includes(term))) return -Infinity;
  }

  const expected = words(queryText).filter((token) => !ignoredTokens.has(token) && !/^(?:\d|kg$|g$|l$|ml$|pack$)/.test(token));
  const actual = new Set(words(candidateText));
  const coverage = expected.filter((token) => actual.has(token)).length / expected.length;
  if (coverage < 0.8) return -Infinity;
  return coverage * 100 + (candidate.barcode ? 5 : 0) + (candidate.imageUrl ? 5 : 0);
}
