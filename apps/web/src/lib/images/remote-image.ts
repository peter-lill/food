const browserHeaders = {
  "Accept-Language": "en-AU,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
};

export type RemoteImage = {
  bytes: Buffer;
  mimeType: string;
  declaredContentLength: number | null;
};

export type RemoteImageFetchOptions = {
  /** The retailer product page that supplied this image URL. */
  referer?: string | null;
};

function woolworthsStockcode(url: string) {
  try {
    const parsed = new URL(url);
    if (!/(?:^|\.)woolworths\.media$/i.test(parsed.hostname)) return null;
    return parsed.pathname.match(/\/(\d{4,12})(?:_\d+)?\.(?:jpe?g|png|webp)$/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

function safeRetailerProductReferer(value: string | null | undefined) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:"
      || (
        !/(?:^|\.)woolworths\.com\.au$/i.test(parsed.hostname)
        && !/(?:^|\.)coles\.com\.au$/i.test(parsed.hostname)
      )
    ) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function sessionCookies(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [];
  const combined = response.headers.get("set-cookie");
  if (!values.length && combined) values.push(combined);
  return values
    .map((cookie) => cookie.split(";", 1)[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie))
    .join("; ");
}

async function imageResponse(url: string, signal: AbortSignal, referer = "", cookie = "") {
  return fetch(url, {
    cache: "no-store",
    redirect: "follow",
    signal,
    headers: {
      ...browserHeaders,
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
      ...(referer ? { Referer: referer } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
}

export async function fetchRemoteImage(
  url: string,
  timeoutMs = 15_000,
  options: RemoteImageFetchOptions = {},
): Promise<RemoteImage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const stockcode = woolworthsStockcode(url);
    const referer = safeRetailerProductReferer(options.referer)
      || (stockcode ? `https://www.woolworths.com.au/shop/productdetails/${stockcode}` : "");

    let response = await imageResponse(url, controller.signal, referer).catch(() => null);
    if ((!response || !response.ok) && referer) {
      await response?.body?.cancel().catch(() => undefined);
      const bootstrap = await fetch(referer, {
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
        headers: { ...browserHeaders, Accept: "text/html,application/xhtml+xml" },
      }).catch(() => null);
      const cookie = bootstrap ? sessionCookies(bootstrap) : "";
      response = await imageResponse(url, controller.signal, referer, cookie);
    }

    if (!response?.ok) throw new Error(`Image returned HTTP ${response?.status ?? "unavailable"}`);
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!mimeType.startsWith("image/")) throw new Error("Remote response was not an image");

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error("Remote image was empty");
    const declaredLength = Number(response.headers.get("content-length"));
    return {
      bytes,
      mimeType,
      declaredContentLength: Number.isFinite(declaredLength) && declaredLength > 0 ? declaredLength : null,
    };
  } finally {
    clearTimeout(timer);
  }
}
