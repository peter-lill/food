import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { requestCatalogueJson } from "./catalogue-bridge-request";

const source = readFileSync(new URL("./mass-import-supported-catalogues.ts", import.meta.url), "utf8");
assert.match(source, /\/aldi\/catalogue\/refresh/);
assert.match(source, /\/drakes\/catalogue\/refresh/);
assert.match(source, /--resume-coles/);
assert.match(source, /\/coles\/catalogue\/collection\/start/);
assert.match(source, /\/coles\/catalogue\/collection\/status/);
assert.match(source, /\/woolworths\/catalogue\/collection\/start/);
assert.match(source, /import-coles-controlled\.ts/);
assert.match(source, /import-woolworths-controlled\.ts/);
assert.match(source, /sync-imported-retailer-catalogues\.ts/);
assert.match(source, /audit-product-categories\.ts/);
assert.match(source, /counts\.failed > 0 \|\| counts\.completed !== counts\.total/);
assert.match(source, /IGA was not included/);
async function testBridgeRequests() {
  const server = createServer((request, response) => {
    if (request.url === "/slow-refresh") {
      // A synchronous refresh sends no headers until collection finishes.
      setTimeout(() => response.end(JSON.stringify({ status: "success", products: 15182 })), 80);
    } else if (request.url === "/failed") {
      response.writeHead(502);
      response.end(JSON.stringify({ status: "error", error: "Drakes refresh failed" }));
    } else {
      response.end("not JSON");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = (path: string) => new URL(`http://127.0.0.1:${address.port}${path}`);
  try {
    assert.equal((await requestCatalogueJson(url("/slow-refresh"), 1000)).products, 15182);
    await assert.rejects(requestCatalogueJson(url("/slow-refresh"), 20), /catalogue request deadline/);
    await assert.rejects(requestCatalogueJson(url("/failed")), /Drakes refresh failed/);
    await assert.rejects(requestCatalogueJson(url("/invalid")), SyntaxError);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

void testBridgeRequests().then(() => console.log("supported retailer mass import tests passed"));
