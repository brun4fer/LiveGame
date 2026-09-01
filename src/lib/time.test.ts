import assert from "node:assert/strict";
import test from "node:test";

import { formatPreciseTime, formatTime, roundTime } from "./time";

test("formats and rounds video timestamps", () => {
  assert.equal(formatTime(65.9), "01:05");
  assert.equal(formatPreciseTime(65.94), "01:05");
  assert.equal(roundTime(12.26), 12.3);
});

