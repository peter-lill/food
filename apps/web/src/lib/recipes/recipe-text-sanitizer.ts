const cssRulePattern = /(?:\.[a-z0-9_-]+|#[a-z0-9_-]+|@media[^\{]*)\s*\{[^{}]*\}/gi;
const htmlEntityMap: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(value: string) {
  return value.replace(/&(amp|quot|#39|apos|nbsp);/gi, (entity) => htmlEntityMap[entity.toLowerCase()] ?? entity);
}

export function sanitiseRecipeText(value: string | null | undefined) {
  if (!value) return "";

  let cleaned = decodeEntities(value)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  // Imported pages can contain several adjacent Emotion/CSS-in-JS rules.
  // Repeat until no complete rule remains.
  for (let pass = 0; pass < 8; pass += 1) {
    const next = cleaned.replace(cssRulePattern, " ");
    if (next === cleaned) break;
    cleaned = next;
  }

  cleaned = cleaned
    .replace(/\.css-[a-z0-9_-]+/gi, " ")
    .replace(/\b(?:font-style|font-weight|font-size|line-height|text-decoration|letter-spacing|margin|padding|display|color|background|border)[^;{}]*(?:;|$)/gi, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

export function sanitiseIngredientName(value: string | null | undefined) {
  return sanitiseRecipeText(value)
    .replace(/^ingredients?\s*/i, "")
    .replace(/^[,;:\-–—\s]+/, "")
    .trim();
}

export function sanitiseInstruction(value: string | null | undefined) {
  return sanitiseRecipeText(value)
    .replace(/^\s*\d+[.)]\s*/, "")
    .trim();
}

export function isMalformedRecipeText(value: string | null | undefined) {
  if (!value) return false;
  return /\.css-|font-style|font-weight|text-decoration|\{[^}]*\}|<style|<script/i.test(value);
}
