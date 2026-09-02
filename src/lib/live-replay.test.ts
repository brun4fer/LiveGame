import assert from "node:assert/strict";
import test from "node:test";

import { getReplayEdge, locateReplayPosition } from "./live-replay";

const segments = [
  { id: "one", startedAtSeconds: 0, durationSeconds: 5 },
  { id: "two", startedAtSeconds: 5, durationSeconds: 5 },
  { id: "three", startedAtSeconds: 10, durationSeconds: 5 },
];

test("locates a rewind target across independent recording segments", () => {
  const position = locateReplayPosition(segments, 7);
  assert.equal(position?.segment.id, "two");
  assert.equal(position?.offsetSeconds, 2);
  assert.equal(position?.virtualSeconds, 7);
});

test("locates a forward target in the following recording segment", () => {
  const position = locateReplayPosition(segments, 12);
  assert.equal(position?.segment.id, "three");
  assert.equal(position?.offsetSeconds, 2);
});

test("clamps replay to the recorded timeline edges", () => {
  assert.equal(locateReplayPosition(segments, -5)?.virtualSeconds, 0);
  assert.equal(locateReplayPosition(segments, 99)?.segment.id, "three");
  assert.ok((locateReplayPosition(segments, 99)?.virtualSeconds || 0) < 15);
  assert.equal(getReplayEdge(segments), 15);
});

test("returns no replay position before a segment is available", () => {
  assert.equal(locateReplayPosition([], 5), null);
});
