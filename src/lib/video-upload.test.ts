import assert from "node:assert/strict";
import test from "node:test";

import { inferVideoUploadPartSize, LEGACY_VIDEO_UPLOAD_PART_SIZE, MIN_VIDEO_UPLOAD_PART_SIZE, videoUploadPartSize } from "./video-upload";

test("uses smaller upload parts for ordinary match recordings", () => {
  assert.equal(videoUploadPartSize(5 * 1024 ** 3), MIN_VIDEO_UPLOAD_PART_SIZE);
});

test("keeps very large uploads within the R2 ten-thousand-part limit", () => {
  const fileSize = 5 * 1024 ** 4 - 5 * 1024 ** 3;
  assert.ok(Math.ceil(fileSize / videoUploadPartSize(fileSize)) <= 10_000);
});

test("resumes uploads created with the previous part size", () => {
  const fileSize = 150 * 1024 * 1024;
  assert.equal(inferVideoUploadPartSize(fileSize, [{ partNumber: 1, size: LEGACY_VIDEO_UPLOAD_PART_SIZE }]), LEGACY_VIDEO_UPLOAD_PART_SIZE);
});

test("keeps the current part size for new uploads", () => {
  assert.equal(inferVideoUploadPartSize(150 * 1024 * 1024, []), MIN_VIDEO_UPLOAD_PART_SIZE);
});
