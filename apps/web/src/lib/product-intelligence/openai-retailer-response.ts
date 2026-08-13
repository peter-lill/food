export type RetailerSearchResponse = {
  output?: Array<{
    type?: string;
    action?: { sources?: Array<{ url?: string }> };
    content?: Array<{ type?: string; text?: string; annotations?: Array<{ type?: string; url?: string }> }>;
  }>;
};

function retailerProductCode(url: URL) {
  if (/(?:^|\.)coles\.com\.au$/i.test(url.hostname)) return url.pathname.match(/-(\d{5,})\/?$/)?.[1] ?? null;
  if (/(?:^|\.)woolworths\.com\.au$/i.test(url.hostname)) return url.pathname.match(/\/productdetails\/(\d{5,})\b/i)?.[1] ?? null;
  return null;
}

export function validatedRetailerLabelText(payload: RetailerSearchResponse, sourceUrl: string) {
  const requested = new URL(sourceUrl);
  const code = retailerProductCode(requested);
  if (!code) return null;
  const urls = (payload.output ?? []).flatMap((item) => [
    ...(item.action?.sources ?? []).map((source) => source.url),
    ...(item.content ?? []).flatMap((content) => (content.annotations ?? []).map((annotation) => annotation.url)),
  ]).filter((url): url is string => Boolean(url));
  const exactSource = urls.some((url) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname === requested.hostname && retailerProductCode(parsed) === code;
    } catch { return false; }
  });
  if (!exactSource) return null;
  const text = (payload.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("\n").trim();
  return /nutrition information/i.test(text) && /ingredients?/i.test(text) ? text : null;
}
