import assert from "node:assert/strict";
import test from "node:test";

import { getYouTubeEmbedUrl, getYouTubeVideoId, normalizeYouTubeUrl } from "./external-video";

test("recognises common YouTube video and live URLs", () => {
  assert.equal(getYouTubeVideoId("https://www.youtube.com/watch?v=abcDEF_1234"), "abcDEF_1234");
  assert.equal(getYouTubeVideoId("https://youtu.be/abcDEF_1234?t=15"), "abcDEF_1234");
  assert.equal(getYouTubeVideoId("https://youtube.com/live/abcDEF_1234"), "abcDEF_1234");
});

test("rejects non-YouTube and malformed links", () => {
  assert.equal(getYouTubeVideoId("https://example.com/watch?v=abcDEF_1234"), null);
  assert.equal(getYouTubeVideoId("not a url"), null);
  assert.throws(() => normalizeYouTubeUrl("https://example.com/video"), /valid YouTube/);
});

test("creates a safe canonical and embedded URL", () => {
  assert.equal(normalizeYouTubeUrl("https://youtu.be/abcDEF_1234"), "https://www.youtube.com/watch?v=abcDEF_1234");
  assert.match(getYouTubeEmbedUrl("https://youtu.be/abcDEF_1234") || "", /^https:\/\/www\.youtube\.com\/embed\/abcDEF_1234\?/);
});
