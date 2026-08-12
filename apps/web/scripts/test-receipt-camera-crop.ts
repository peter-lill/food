import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectCropToImage, visibleFrameSourceCrop } from "../src/lib/receipts/camera-frame-crop";

// Production-shaped mobile case: a landscape 1280x720 sensor is displayed as
// a portrait 390x844 object-fit:cover preview. The tall guide must contain the
// complete long receipt, not just its header and first few product rows.
const mobileCrop = visibleFrameSourceCrop(
  { width: 1280, height: 720 },
  { left: 0, top: 0, width: 390, height: 844 },
  { left: 49, top: 104, width: 292, height: 540 },
);
assert.ok(mobileCrop);
assert.deepEqual(
  Object.fromEntries(Object.entries(mobileCrop).map(([key, value]) => [key, Math.round(value)])),
  { left: 515, top: 89, width: 249, height: 461 },
);
assert.ok(mobileCrop.width < 1280 / 3, "portrait preview should exclude landscape content hidden by object-fit cover");
const fullResolutionCrop = projectCropToImage(mobileCrop, { width: 1280, height: 720 }, { width: 4032, height: 3024 });
assert.ok(fullResolutionCrop);
assert.deepEqual(
  Object.fromEntries(Object.entries(fullResolutionCrop).map(([key, value]) => [key, Math.round(value)])),
  { left: 1624, top: 657, width: 785, height: 1451 },
);
assert.ok(fullResolutionCrop.width >= 700, "the full-resolution still must preserve enough receipt pixels for OCR");
assert.ok(fullResolutionCrop.height / fullResolutionCrop.width > 1.8, "the guide must include a long receipt's products and total section");

const cameraStyles = readFileSync(new URL("../src/app/scan/scan.module.css", import.meta.url), "utf8");
assert.match(cameraStyles, /\.receiptFrame\s*\{[\s\S]*?aspect-ratio:\s*\.54/, "the visible camera guide must use the tested long-receipt aspect ratio");

const matchingAspect = visibleFrameSourceCrop(
  { width: 1000, height: 1500 },
  { left: 0, top: 0, width: 400, height: 600 },
  { left: 40, top: 60, width: 320, height: 480 },
);
assert.deepEqual(matchingAspect, { left: 100, top: 150, width: 800, height: 1200 });
assert.equal(visibleFrameSourceCrop({ width: 0, height: 0 }, { left: 0, top: 0, width: 390, height: 844 }, { left: 16, top: 104, width: 358, height: 490 }), null);

console.log("Receipt camera visible-frame crop checks passed.");
