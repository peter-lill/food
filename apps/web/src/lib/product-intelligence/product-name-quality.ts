const cssNoisePatterns = [
  /\bcss[-_\s]?[a-z0-9]{5,}\b/gi,
  /\b(?:webkit|moz|ms)[a-z0-9-]*\b/gi,
  /\b(?:font|text|line|letter|word|white|background|border|margin|padding|display|align|justify|flex|grid|position|width|height|overflow|transform|transition)[-_\s]?(?:style|weight|size|family|height|spacing|align|decoration|color|radius|top|right|bottom|left|content|items|self|direction|wrap|grow|shrink|basis)?\b/gi,
  /\b(?:inherit|initial|unset|normal|none|auto|block|inline|flex|grid|relative|absolute|center|transparent)\b/gi,
  /\b(?:emotion|chakra|mui|styled-components?|classname)\b/gi,
  /\{[^{}]*\}/g,
  /[.#][a-z][a-z0-9_-]{4,}/gi,
];

const invalidNamePatterns = [
  /\bcss[-_\s]?[a-z0-9]{5,}\b/i,
  /\b(?:fontstyle|fontweight|webkit|emotion|chakra|mui|styled-components?|classname)\b/i,
  /[{}<>]/,
  /https?:\/\//i,
];

const leadingPunctuationPattern = /^[.,;:|_-]+\s*[A-Za-z0-9]/;

function normaliseWhitespace(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseForComparison(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function repeatedCleanSuffix(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  let best: string | null = null;

  for (let size = 2; size <= Math.min(14, Math.floor(words.length / 2)); size += 1) {
    const suffixWords = words.slice(-size);
    const suffix = suffixWords.join(" ");
    const normalisedSuffix = normaliseForComparison(suffix);
    if (!normalisedSuffix || invalidNamePatterns.some((pattern) => pattern.test(suffix))) continue;

    const prefix = normaliseForComparison(words.slice(0, -size).join(" "));
    if (prefix.includes(normalisedSuffix)) best = suffix;
  }

  return best;
}

function collapseRepeatedPhrase(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  for (let size = 1; size <= Math.floor(words.length / 2); size += 1) {
    if (words.length % size !== 0) continue;
    const phrase = words.slice(0, size).join(" ");
    const repeated = Array.from({ length: words.length / size }, () => phrase).join(" ");
    if (normaliseForComparison(repeated) === normaliseForComparison(value)) return phrase;
  }
  return value;
}

function stripUnsafeLeadingPunctuation(value: string) {
  return value.replace(/^\s*[.,;:|_-]+\s*(?=[A-Za-z0-9])/, "").trim();
}

export function hasProductNameContamination(value: string | null | undefined) {
  if (!value) return true;
  const clean = normaliseWhitespace(value);
  return clean.length > 180
    || leadingPunctuationPattern.test(clean)
    || invalidNamePatterns.some((pattern) => pattern.test(clean));
}

export function sanitiseProductName(value: string | null | undefined) {
  if (!value) return null;
  const initial = normaliseWhitespace(value);
  if (!initial) return null;

  const repeatedSuffix = repeatedCleanSuffix(initial);
  if (repeatedSuffix) return collapseRepeatedPhrase(stripUnsafeLeadingPunctuation(normaliseWhitespace(repeatedSuffix)));

  let cleaned = initial;
  for (const pattern of cssNoisePatterns) cleaned = cleaned.replace(pattern, " ");
  cleaned = stripUnsafeLeadingPunctuation(
    collapseRepeatedPhrase(normaliseWhitespace(cleaned.replace(/[;|]+/g, " "))),
  );

  if (!cleaned || cleaned.length > 180 || invalidNamePatterns.some((pattern) => pattern.test(cleaned))) return null;
  if (!/[a-z]/i.test(cleaned)) return null;
  return cleaned;
}

export function validateProductName(value: string | null | undefined) {
  const sanitised = sanitiseProductName(value);
  const original = value ? normaliseWhitespace(value) : "";
  const changed = Boolean(sanitised && sanitised !== original);
  const leadingPunctuation = leadingPunctuationPattern.test(original);

  return {
    valid: Boolean(sanitised),
    sanitised,
    changed,
    issues: [
      ...(!original ? ["name-missing"] : []),
      ...(leadingPunctuation ? ["name-leading-punctuation"] : []),
      ...(original && invalidNamePatterns.some((pattern) => pattern.test(original)) ? ["name-contaminated"] : []),
      ...(original.length > 180 ? ["name-too-long"] : []),
    ],
  };
}
