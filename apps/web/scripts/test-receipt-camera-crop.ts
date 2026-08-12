import assert from "node:assert/strict";
import { visibleFrameSourceCrop } from "../src/lib/receipts/camera-frame-crop";

// Production-shaped mobile case: a landscape 1280x720 sensor is displayed as
// a portrait 390x844 object-fit:cover preview. The saved file must be the guide,
// not the full landscape sensor image containing off-screen surroundings.
const mobileCrop = visibleFrameSourceCrop(
  { width: 1280, height: 720 },
  { left: 0, top: 0, width: 390, height: 844 },
  { left: 16, top: 104, width: 358, height: 490 },
);
assert.ok(mobileCrop);
assert.deepEqual(
  Object.fromEntries(Object.entries(mobileCrop).map(([key, value]) => [key, Math.round(value)])),
  { left: 487, top: 89, width: 305, height: 418 },
);
assert.ok(mobileCrop.width < 1280 / 3, "portrait preview should exclude landscape content hidden by object-fit cover");

const matchingAspect = visibleFrameSourceCrop(
  { width: 1000, height: 1500 },
  { left: 0, top: 0, width: 400, height: 600 },
  { left: 40, top: 60, width: 320, height: 480 },
);
assert.deepEqual(matchingAspect, { left: 100, top: 150, width: 800, height: 1200 });
assert.equal(visibleFrameSourceCrop({ width: 0, height: 0 }, { left: 0, top: 0, width: 390, height: 844 }, { left: 16, top: 104, width: 358, height: 490 }), null);

console.log("Receipt camera visible-frame crop checks passed.");
