import { classifyGenericProduce } from "../src/lib/products/generic-produce-classification";
import { isPreparedProduceName } from "../src/lib/products/generic-produce";

export type ExistingGenericProduce = {
  id: string;
  name: string;
  canonicalName: string | null;
  packSize: string | null;
};

export function genericProduceComparisonKey(
  name: string,
  packSize: string | null | undefined,
  isGenericProduce: boolean,
) {
  return isGenericProduce ? classifyGenericProduce(name, packSize)?.comparisonKey ?? null : null;
}

/** Candidates must be ordered by the caller's preferred target order. */
export function indexGenericProduceCandidates(candidates: ExistingGenericProduce[]) {
  const index = new Map<string, string>();
  for (const candidate of candidates) {
    const identityName = candidate.canonicalName ?? candidate.name;
    if (isPreparedProduceName(identityName) || isPreparedProduceName(candidate.name)) continue;
    const classification = classifyGenericProduce(identityName, candidate.packSize);
    if (classification && !index.has(classification.comparisonKey)) {
      index.set(classification.comparisonKey, candidate.id);
    }
  }
  return index;
}
