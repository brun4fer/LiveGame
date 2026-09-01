import assert from "node:assert/strict";
import test from "node:test";

import { liveMomentWindow } from "./live-store";

test("creates the default live moment from the previous 20 seconds", () => {
  assert.deepEqual(liveMomentWindow(125), { startTimeSeconds: 105, endTimeSeconds: 125, durationSeconds: 20 });
});

test("clamps a live moment to the beginning of the recording", () => {
  assert.deepEqual(liveMomentWindow(8), { startTimeSeconds: 0, endTimeSeconds: 8, durationSeconds: 8 });
});

test("supports an adjusted lead time", () => {
  assert.deepEqual(liveMomentWindow(90, 35), { startTimeSeconds: 55, endTimeSeconds: 90, durationSeconds: 35 });
});
