import type { RetailerProfile } from "./types";

const sharedPaymentMarkers = [
  /\bcredit\s+account\b/i,
  /\bdebit\s+account\b/i,
  /\beft(?:pos)?\b/i,
  /\bvisa\b/i,
  /\bmastercard\b/i,
  /\bamex\b/i,
  /\bapproved\b/i,
  /\bauth(?:orisation)?\b/i,
  /\brrn\b/i,
  /\bpayment\b/i,
  /\bcard\s*(?:no|number)?\b/i,
];

const sharedIgnoredMarkers = [
  /^\s*(?:abn|gst|tax|change|cash|saving|you saved|receipt|www\.|tel|phone|store|served by|flybuys|rewards?)\b/i,
  /^\s*(?:thank you|please retain|customer copy|merchant copy)\b/i,
];

export const retailerProfiles: RetailerProfile[] = [
  {
    key: "coles",
    displayName: "Coles",
    retailerMarkers: [/\bcoles\b/i],
    itemStartMarkers: [/^\s*description\s*$/i, /^\s*items?\s*$/i],
    itemEndMarkers: [/\btotal\s+for\s+\d+\s+items?\b/i, /^\s*(?:grand\s+)?total\b/i, /^\s*amount\s+due\b/i],
    paymentMarkers: sharedPaymentMarkers,
    ignoredMarkers: sharedIgnoredMarkers,
  },
  {
    key: "woolworths",
    displayName: "Woolworths",
    retailerMarkers: [/\bwoolworths\b/i, /\bwoolies\b/i],
    itemStartMarkers: [/^\s*description\s*$/i, /^\s*items?\s*$/i],
    itemEndMarkers: [/^\s*(?:grand\s+)?total\b/i, /^\s*amount\s+due\b/i],
    paymentMarkers: sharedPaymentMarkers,
    ignoredMarkers: sharedIgnoredMarkers,
  },
  {
    key: "aldi",
    displayName: "ALDI",
    retailerMarkers: [/\baldi\b/i],
    itemStartMarkers: [/^\s*items?\s*$/i],
    itemEndMarkers: [/^\s*(?:grand\s+)?total\b/i, /^\s*amount\s+due\b/i],
    paymentMarkers: sharedPaymentMarkers,
    ignoredMarkers: sharedIgnoredMarkers,
  },
  {
    key: "iga",
    displayName: "IGA",
    retailerMarkers: [/\biga\b/i],
    itemStartMarkers: [/^\s*items?\s*$/i],
    itemEndMarkers: [/^\s*(?:grand\s+)?total\b/i, /^\s*amount\s+due\b/i],
    paymentMarkers: sharedPaymentMarkers,
    ignoredMarkers: sharedIgnoredMarkers,
  },
  {
    key: "drakes",
    displayName: "Drakes",
    retailerMarkers: [/\bdrakes\b/i],
    itemStartMarkers: [/^\s*items?\s*$/i],
    itemEndMarkers: [/^\s*(?:grand\s+)?total\b/i, /^\s*amount\s+due\b/i],
    paymentMarkers: sharedPaymentMarkers,
    ignoredMarkers: sharedIgnoredMarkers,
  },
  {
    key: "costco",
    displayName: "Costco",
    retailerMarkers: [/\bcostco\b/i],
    itemStartMarkers: [/^\s*items?\s*$/i],
    itemEndMarkers: [/^\s*(?:grand\s+)?total\b/i, /^\s*amount\s+due\b/i],
    paymentMarkers: sharedPaymentMarkers,
    ignoredMarkers: sharedIgnoredMarkers,
  },
];

export const genericProfile: RetailerProfile = {
  key: "generic",
  displayName: "Unknown retailer",
  retailerMarkers: [],
  itemStartMarkers: [/^\s*description\s*$/i, /^\s*items?\s*$/i],
  itemEndMarkers: [/^\s*(?:grand\s+)?total\b/i, /^\s*amount\s+due\b/i],
  paymentMarkers: sharedPaymentMarkers,
  ignoredMarkers: sharedIgnoredMarkers,
};
