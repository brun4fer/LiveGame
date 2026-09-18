import assert from "node:assert/strict";
import test from "node:test";

import { planSegmentedMomentExport, type TimedVideoSource } from "./video-export";

function source(name: string, start: number, duration = 10): TimedVideoSource {
  return { sourceUrl: name, startedAtSeconds: start, durationSeconds: duration };
}

test("plans a live moment across consecutive replay segments", () => {
  const result = planSegmentedMomentExport([
    source("third", 20),
    source("first", 0),
    source("second", 10),
  ], 6, 26);

  assert.equal(result.complete, true);
  assert.deepEqual(result.slices.map((slice) => ({
    source: slice.sourceUrl,
    start: slice.startSeconds,
    end: slice.endSeconds,
  })), [
    { source: "first", start: 6, end: 10 },
    { source: "second", start: 0, end: 10 },
    { source: "third", start: 0, end: 6 },
  ]);
});

test("reports an incomplete live moment while its final replay segment is still open", () => {
  const result = planSegmentedMomentExport([
    source("first", 0),
    source("second", 10),
  ], 5, 25);

  assert.equal(result.complete, false);
  assert.equal(result.coveredUntil, 20);
});

test("does not bridge a missing section of the replay buffer", () => {
  const result = planSegmentedMomentExport([
    source("first", 0),
    source("third", 21),
  ], 5, 25);

  assert.equal(result.complete, false);
  assert.equal(result.coveredUntil, 10);
});
