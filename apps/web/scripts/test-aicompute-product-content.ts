import assert from "node:assert/strict";
import { aiComputeChat } from "../src/lib/ai/aicompute";
import { parseGeneratedProductContent } from "../src/lib/ai/product-content-validation";

async function main() {
  let requestedUrl = "";
  let authorization = "";
  const fakeFetch: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"overview":"A familiar grocery product suitable for everyday pantry planning.","uses":["Everyday meals"],"storage":[]}' } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const raw = await aiComputeChat({ apiKey: "secret-test-key", baseUrl: "https://api.aicompute.au/v1/", model: "test-model" }, [{ role: "user", content: "test" }], fakeFetch);
  assert.equal(requestedUrl, "https://api.aicompute.au/v1/chat/completions");
  assert.equal(authorization, "Bearer secret-test-key");
  assert.deepEqual(parseGeneratedProductContent(raw).storage, []);
  assert.throws(() => parseGeneratedProductContent('{"overview":"This product cures illness and is guaranteed safe for everyone.","uses":[],"storage":[]}'), /prohibited claim/);
  assert.throws(() => parseGeneratedProductContent('{"overview":"Too short","uses":[],"storage":[]}'), /validation/);
  console.log("AI Compute product content tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
