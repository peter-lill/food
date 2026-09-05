import { normaliseProductText } from "./product-normalisation";
import { retailerPathDepartment, type SupermarketDepartment } from "./product-category";

export type TaxonomyRetailer = "Coles" | "Woolworths" | "ALDI" | "Drakes";

export type RetailerTaxonomyEvidence = {
  retailer: TaxonomyRetailer;
  paths: string[];
  labels?: string[];
};

export type RetailerTaxonomyAssessment = {
  retailer: TaxonomyRetailer;
  paths: string[];
  deepestPath: string | null;
  department: SupermarketDepartment | null;
  conflict: boolean;
  departments: SupermarketDepartment[];
};

function cleanPath(value: string) {
  return value
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/")
    .split(/[?#]/, 1)[0]!
    .replace(/\/+$/, "")
    .trim();
}

function pathDepth(value: string) {
  return cleanPath(value).split("/").filter(Boolean).length;
}

export function normaliseRetailerPaths(paths: Iterable<string | null | undefined>) {
  const unique = new Set<string>();
  for (const raw of paths) {
    if (!raw) continue;
    const path = cleanPath(raw);
    if (path) unique.add(path);
  }
  return [...unique].sort((left, right) => pathDepth(right) - pathDepth(left) || left.localeCompare(right));
}

export function deepestRetailerPath(paths: Iterable<string | null | undefined>) {
  return normaliseRetailerPaths(paths)[0] ?? null;
}

export function assessRetailerTaxonomy(evidence: RetailerTaxonomyEvidence): RetailerTaxonomyAssessment {
  const paths = normaliseRetailerPaths(evidence.paths);
  const departments = [...new Set(paths.flatMap((path) => {
    const department = retailerPathDepartment(path);
    return department ? [department] : [];
  }))];

  return {
    retailer: evidence.retailer,
    paths,
    deepestPath: paths[0] ?? null,
    department: departments.length === 1 ? departments[0]! : null,
    conflict: departments.length > 1,
    departments,
  };
}

export function taxonomyEvidenceKey(retailer: TaxonomyRetailer, externalId: string | null, productName: string) {
  return `${retailer}:${externalId?.trim() || normaliseProductText(productName)}`;
}

export function mergeRetailerTaxonomyEvidence(entries: RetailerTaxonomyEvidence[]) {
  const byRetailer = new Map<TaxonomyRetailer, Set<string>>();
  for (const entry of entries) {
    const paths = byRetailer.get(entry.retailer) ?? new Set<string>();
    for (const path of normaliseRetailerPaths(entry.paths)) paths.add(path);
    byRetailer.set(entry.retailer, paths);
  }
  return [...byRetailer.entries()].map(([retailer, paths]) => assessRetailerTaxonomy({ retailer, paths: [...paths] }));
}
