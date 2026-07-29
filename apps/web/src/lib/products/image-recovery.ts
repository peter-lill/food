import { prisma } from "@/lib/prisma";
import { searchColesAndWoolworths } from "@/lib/prices/coles-woolworths-provider";
import { findBestProductImage } from "@/lib/products/image-intelligence";
import { assessProductImage, type ProductImageAssessment } from "@/lib/products/image-quality";
import {
  markSelectedCandidate,
  recordCandidateAssessment,
  recordDiscoveredCandidate,
} from "@/lib/products/image-candidate.repository";

const produceTerms = [
  "apple", "avocado", "banana", "broccoli", "carrot", "cauliflower", "capsicum",
  "cucumber", "garlic", "ginger", "lemon", "lettuce", "lime", "mushroom",
  "onion", "potato", "spinach", "sweet potato", "tomato", "zucchini",
] as const;

const genericFoodTerms = [
  ...produceTerms,
  "chicken breast", "chicken thigh", "beef mince", "pork mince", "salmon",
  "steak", "lamb chop", "rice", "flour", "sugar", "oats", "pine nuts",
] as const;

const unsuitableCommonsWords = [
  "diagram", "drawing", "icon", "logo", "map", "painting", "poster", "seal", "symbol",
  "schizophyllum", "spore", "microscopy", "fungus",
] as const;

const commonsQueries: Record<string, string> = {
  mushroom: "button mushroom Agaricus bisporus food",
  broccoli: "broccoli vegetable food",
  "chicken breast": "raw chicken breast food",
  "chicken thigh": "raw chicken thigh food",
  "beef mince": "raw beef mince food",
  "pork mince": "raw pork mince food",
  salmon: "raw salmon fillet food",
  steak: "raw beef steak food",
  rice: "uncooked rice food",
};

export type ImageSearchDiagnosticStep = {
  provider: string;
  status: "success" | "skipped" | "failed";
  candidates: number;
  detail: string;
};

export type ImageSearchDiagnostics = {
  identity: string;
  barcode: string | null;
  queries: string[];
  steps: ImageSearchDiagnosticStep[];
  validation: Array<{ source: string; accepted: boolean; score: number | null; reason: string }>;
  selectedSource: string | null;
};

type Candidate = {
  url: string;
  source: string;
  sourceLabel: string;
  providerScore: number;
  identityScore: number | null;
};

type CandidateInspection = {
  accepted: boolean;
  score: number | null;
  reason: string;
  assessment: ProductImageAssessment;
};

function normalise(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function recognisedIdentity(values: string[], terms: readonly string[]) {
  const identity = normalise(values.join(" "));
  return terms.find((term) => (
    identity === term
    || identity.includes(` ${term} `)
    || identity.startsWith(`${term} `)
    || identity.endsWith(` ${term}`)
  )) ?? null;
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function providerScore(source: string) {
  const key = normalise(source);
  if (key.includes("coles") || key.includes("woolworths")) return 95;
  if (key.includes("open food facts")) return 75;
  if (key.includes("wikimedia")) return 70;
  return 60;
}

function emptyAssessment(url: string): ProductImageAssessment {
  return {
    url,
    reachable: false,
    contentType: null,
    contentLength: null,
    width: null,
    height: null,
    score: 0,
    issues: ["Image assessment failed"],
  };
}

async function inspectCandidate(candidate: Candidate): Promise<CandidateInspection> {
  const assessment = await assessProductImage(candidate.url).catch(() => emptyAssessment(candidate.url));
  if (!assessment.reachable) return { accepted: false, score: assessment.score, reason: "Image could not be reached", assessment };
  if (!assessment.contentType?.startsWith("image/")) return { accepted: false, score: assessment.score, reason: "Response was not an image", assessment };
  if (assessment.score < 35) return { accepted: false, score: assessment.score, reason: `Quality score ${assessment.score} was below 35`, assessment };
  return { accepted: true, score: assessment.score, reason: "Usable image", assessment };
}

async function openFoodFactsImage(barcode: string) {
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=status,code,image_front_url,image_url`,
    { cache: "no-store", headers: { Accept: "application/json", "User-Agent": "Food/0.1 (https://food.coffeehq.coffee)" } },
  ).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json() as { status?: number; code?: string; product?: { image_front_url?: string; image_url?: string } };
  if (payload.status === 0 || payload.code !== barcode) return null;
  return payload.product?.image_front_url ?? payload.product?.image_url ?? null;
}

type CommonsPage = {
  title?: string;
  imageinfo?: Array<{ url?: string; thumburl?: string; mime?: string; width?: number; height?: number }>;
};

async function wikimediaFoodImages(identity: string) {
  const query = commonsQueries[identity] ?? `${identity} food isolated`;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "12",
    prop: "imageinfo",
    iiprop: "url|mime|size",
    iiurlwidth: "900",
  });

  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "Food/0.1 (https://food.coffeehq.coffee)" },
  }).catch(() => null);
  if (!response?.ok) return [];

  const payload = await response.json() as { query?: { pages?: Record<string, CommonsPage> } };
  const identityTerms = normalise(identity).split(" ").filter(Boolean);

  return Object.values(payload.query?.pages ?? {})
    .map((page) => {
      const info = page.imageinfo?.[0];
      const title = normalise(page.title ?? "");
      const matchedTerms = identityTerms.filter((term) => title.includes(term)).length;
      const unsuitable = unsuitableCommonsWords.some((word) => title.includes(word));
      const landscapePenalty = info?.width && info?.height && info.width / info.height > 3 ? 1 : 0;
      return {
        url: info?.thumburl ?? info?.url ?? null,
        title: page.title ?? identity,
        score: matchedTerms * 20 - (unsuitable ? 100 : 0) - landscapePenalty * 20,
        mime: info?.mime ?? "",
      };
    })
    .filter((candidate) => candidate.url && candidate.mime.startsWith("image/") && candidate.score > 0)
    .sort((left, right) => right.score - left.score);
}

export async function recoverProductImage(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      canonicalName: true,
      brand: true,
      barcode: true,
      category: true,
      packSize: true,
      aliases: { select: { alias: true } },
    },
  });
  if (!product) throw new Error("Product not found.");

  const barcode = product.barcode?.replace(/\D/g, "") ?? "";
  const identityValues = unique([
    product.name,
    product.canonicalName,
    product.brand,
    product.packSize,
    product.category,
    ...product.aliases.map((alias) => alias.alias),
  ]);
  const produceIdentity = recognisedIdentity(identityValues, produceTerms);
  const genericIdentity = recognisedIdentity(identityValues, genericFoodTerms);
  const identity = genericIdentity ?? product.canonicalName ?? product.name;
  const diagnostics: ImageSearchDiagnostics = {
    identity,
    barcode: barcode || null,
    queries: [],
    steps: [],
    validation: [],
    selectedSource: null,
  };

  const primary = await findBestProductImage(productId).catch((error) => {
    diagnostics.steps.push({ provider: "Primary pipeline", status: "failed", candidates: 0, detail: error instanceof Error ? error.message : "Unknown failure" });
    return null;
  });
  if (primary?.imageUrl) {
    const candidate: Candidate = {
      url: primary.imageUrl,
      source: "Primary pipeline",
      sourceLabel: "Primary pipeline",
      providerScore: 80,
      identityScore: null,
    };
    const candidateId = await recordDiscoveredCandidate(product.id, candidate);
    const inspection = await inspectCandidate(candidate);
    const overallScore = inspection.score ?? 0;
    await recordCandidateAssessment({
      candidateId,
      assessment: inspection.assessment,
      accepted: inspection.accepted,
      rejectionReasons: inspection.accepted ? [] : [inspection.reason],
      overallScore,
    });
    diagnostics.validation.push({ source: candidate.source, accepted: inspection.accepted, score: inspection.score, reason: inspection.reason });
    diagnostics.steps.push({ provider: "Primary pipeline", status: inspection.accepted ? "success" : "failed", candidates: 1, detail: inspection.reason });
    if (inspection.accepted) {
      await markSelectedCandidate(product.id, candidateId);
      diagnostics.selectedSource = candidate.source;
      return { ...primary, diagnostics };
    }
  } else if (!diagnostics.steps.some((step) => step.provider === "Primary pipeline")) {
    diagnostics.steps.push({ provider: "Primary pipeline", status: "success", candidates: 0, detail: "No suitable candidate returned" });
  }

  const candidates: Candidate[] = [];
  if (/^\d{7,14}$/.test(barcode)) {
    const exact = await openFoodFactsImage(barcode);
    diagnostics.steps.push({ provider: "Open Food Facts", status: "success", candidates: exact ? 1 : 0, detail: exact ? "Exact barcode image returned" : "No exact barcode image" });
    if (exact) candidates.push({
      url: exact,
      source: "Open Food Facts",
      sourceLabel: "Exact barcode image",
      providerScore: providerScore("Open Food Facts"),
      identityScore: 100,
    });
  } else {
    diagnostics.steps.push({ provider: "Open Food Facts", status: "skipped", candidates: 0, detail: "No barcode available" });
  }

  const queries = unique([
    barcode || null,
    [product.brand, product.name, product.packSize].filter(Boolean).join(" "),
    [product.brand, product.canonicalName, product.packSize].filter(Boolean).join(" "),
    product.name,
    product.canonicalName,
    ...product.aliases.map((alias) => alias.alias),
    produceIdentity,
  ]).slice(0, 10);
  diagnostics.queries = queries;

  let retailerCount = 0;
  for (const query of queries) {
    const results = await searchColesAndWoolworths(query).catch(() => []);
    retailerCount += results.length;
    for (const result of results) {
      if (!result.imageUrl) continue;
      candidates.push({
        url: result.imageUrl,
        source: result.retailer || "Retailer",
        sourceLabel: `${result.retailer || "Retailer"} · ${result.productName}`,
        providerScore: providerScore(result.retailer || "Retailer"),
        identityScore: null,
      });
    }
  }
  diagnostics.steps.push({ provider: "Coles / Woolworths", status: "success", candidates: retailerCount, detail: `Ran ${queries.length} search ${queries.length === 1 ? "query" : "queries"}` });

  if (genericIdentity) {
    const commons = await wikimediaFoodImages(genericIdentity);
    diagnostics.steps.push({ provider: "Wikimedia Commons", status: "success", candidates: commons.length, detail: `Searched for ${commonsQueries[genericIdentity] ?? `${genericIdentity} food isolated`}` });
    candidates.push(...commons.map((candidate) => ({
      url: candidate.url as string,
      source: "Wikimedia Commons",
      sourceLabel: candidate.title,
      providerScore: providerScore("Wikimedia Commons"),
      identityScore: Math.min(100, Math.max(0, candidate.score)),
    })));
  } else {
    diagnostics.steps.push({ provider: "Wikimedia Commons", status: "skipped", candidates: 0, detail: "Product was not recognised as a generic food" });
  }

  const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()];
  const candidateIds = new Map<string, string>();
  for (const candidate of uniqueCandidates) {
    candidateIds.set(candidate.url, await recordDiscoveredCandidate(product.id, candidate));
  }

  for (const candidate of uniqueCandidates) {
    const candidateId = candidateIds.get(candidate.url);
    if (!candidateId) continue;
    const inspection = await inspectCandidate(candidate);
    const overallScore = Math.round(
      (inspection.assessment.score * 0.65)
      + (candidate.providerScore * 0.25)
      + ((candidate.identityScore ?? 50) * 0.10),
    );
    await recordCandidateAssessment({
      candidateId,
      assessment: inspection.assessment,
      accepted: inspection.accepted,
      rejectionReasons: inspection.accepted ? [] : [inspection.reason, ...inspection.assessment.issues],
      overallScore,
    });
    diagnostics.validation.push({ source: candidate.source, accepted: inspection.accepted, score: overallScore, reason: inspection.reason });
    if (!inspection.accepted) continue;

    await prisma.product.update({
      where: { id: product.id },
      data: {
        imageUrl: candidate.url,
        lifecycle: "READY",
        confidenceScore: produceIdentity ? 0.85 : genericIdentity ? 0.8 : 0.75,
      },
    });
    await markSelectedCandidate(product.id, candidateId);
    diagnostics.selectedSource = candidate.source;
    return { imageUrl: candidate.url, status: "selected" as const, diagnostics };
  }

  return {
    imageUrl: null,
    status: produceIdentity ? "no-produce-match" as const : "no-exact-match" as const,
    diagnostics,
  };
}
