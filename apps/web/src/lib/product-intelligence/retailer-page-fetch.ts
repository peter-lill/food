const browserHeaders = {
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9",
  "Accept-Language": "en-AU,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
};

function responseCookies(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [];
  const combined = response.headers.get("set-cookie");
  if (!values.length && combined) values.push(combined);
  return values
    .map((cookie) => cookie.split(";", 1)[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie))
    .join("; ");
}

export async function fetchRetailerPage(sourceUrl: string, signal: AbortSignal) {
  const parsed = new URL(sourceUrl);
  const isColes = /(?:^|\.)coles\.com\.au$/i.test(parsed.hostname);
  let cookie = "";

  if (isColes) {
    const landing = await fetch(`${parsed.origin}/`, {
      cache: "no-store",
      redirect: "follow",
      signal,
      headers: browserHeaders,
    }).catch(() => null);
    if (landing) {
      cookie = responseCookies(landing);
      await landing.arrayBuffer().catch(() => undefined);
    }
  }

  const response = await fetch(sourceUrl, {
    cache: "no-store",
    redirect: "follow",
    signal,
    headers: {
      ...browserHeaders,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(isColes ? { Referer: `${parsed.origin}/` } : {}),
    },
  });
  return { response, html: await response.text() };
}
