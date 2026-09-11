import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";

// Full Drakes refreshes legitimately take longer than fetch's five-minute
// response-header deadline. Own the deadline for this server-to-server job.
export function requestCatalogueJson(url: URL, timeoutMs = 30_000): Promise<Record<string, unknown>> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return Promise.reject(new Error("Catalogue bridge must use HTTP or HTTPS."));
  }
  return new Promise((resolve, reject) => {
    const get = url.protocol === "https:" ? httpsGet : httpGet;
    const request = get(url, { headers: { Accept: "application/json" } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("error", reject);
      response.on("end", () => {
        try {
          const payload: unknown = JSON.parse(body);
          if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            throw new Error(`${url.pathname} returned an invalid JSON object.`);
          }
          const result = payload as Record<string, unknown>;
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300 || result.status === "error") {
            throw new Error(`${url.pathname} failed: ${String(result.error ?? `HTTP ${response.statusCode}`)}`);
          }
          resolve(result);
        } catch (error) { reject(error); }
      });
    });
    const timer = setTimeout(() => {
      request.destroy(new Error(`${url.pathname} exceeded its ${timeoutMs}ms catalogue request deadline.`));
    }, timeoutMs);
    request.on("error", reject);
    request.on("close", () => clearTimeout(timer));
  });
}
