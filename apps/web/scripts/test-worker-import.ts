import assert from "node:assert/strict";

import { handleBackgroundJob, providerForJob } from "../src/lib/jobs/worker-handlers";

assert.equal(typeof handleBackgroundJob, "function", "the standalone worker handler graph must load outside Next.js");
assert.equal(typeof providerForJob, "function", "worker provider routing must load outside Next.js");

console.log("Standalone worker import regression passed.");
