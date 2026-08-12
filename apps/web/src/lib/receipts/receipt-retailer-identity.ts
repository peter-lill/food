const retailerMarkers = {
  coles: [/\bcoles\b/i, /coles supermarkets/i, /45\s+004\s+189\s+708/],
  woolworths: [/\bwoolworths\b/i, /woolworths group/i, /the fresh food people/i, /everyday rewards/i, /\bereceipt\b/i],
  aldi: [/\baldi\b/i, /aldi stores/i, /shopping at aldi/i],
  iga: [/\biga\b/i],
  drakes: [/\bdrakes\b/i],
  costco: [/\bcostco\b/i, /costco wholesale/i, /wholesale australia/i],
} as const;

export type ReceiptRetailerIdentity = keyof typeof retailerMarkers;

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(current[rightIndex - 1] + 1, previous[rightIndex] + 1,
        previous[rightIndex - 1] + Number(left[leftIndex - 1] !== right[rightIndex - 1]));
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

export function hasRetailerIdentity(text: string, retailer: ReceiptRetailerIdentity) {
  if (retailerMarkers[retailer].some((marker) => marker.test(text))) return true;
  const maximumDistance = retailer.length >= 10 ? 3 : retailer.length >= 5 ? 2 : 1;
  return text.split(/\r?\n/).some((line) => {
    const token = line.toLocaleLowerCase("en-AU").replace(/[^a-z]/g, "");
    return (retailer.length > 6 || token.length === retailer.length)
      && token.length >= Math.max(3, retailer.length - maximumDistance)
      && token.length <= retailer.length + maximumDistance
      && editDistance(token, retailer) <= maximumDistance;
  });
}

export function hasKnownRetailerIdentity(text: string) {
  return (Object.keys(retailerMarkers) as ReceiptRetailerIdentity[]).some((retailer) => hasRetailerIdentity(text, retailer));
}
