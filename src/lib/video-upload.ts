const MEBIBYTE = 1024 * 1024;

export const MIN_VIDEO_UPLOAD_PART_SIZE = 32 * MEBIBYTE;
export const LEGACY_VIDEO_UPLOAD_PART_SIZE = 64 * MEBIBYTE;

export function videoUploadPartSize(fileSize: number) {
  return Math.max(MIN_VIDEO_UPLOAD_PART_SIZE, Math.ceil(fileSize / 10_000 / MEBIBYTE) * MEBIBYTE);
}

export function legacyVideoUploadPartSize(fileSize: number) {
  return Math.max(LEGACY_VIDEO_UPLOAD_PART_SIZE, Math.ceil(fileSize / 10_000 / MEBIBYTE) * MEBIBYTE);
}

export function inferVideoUploadPartSize(fileSize: number, completedParts: Array<{ partNumber: number; size?: number }>) {
  const current = videoUploadPartSize(fileSize);
  if (!completedParts.length || partsMatchSize(fileSize, current, completedParts)) return current;
  const legacy = legacyVideoUploadPartSize(fileSize);
  return partsMatchSize(fileSize, legacy, completedParts) ? legacy : current;
}

function partsMatchSize(fileSize: number, partSize: number, parts: Array<{ partNumber: number; size?: number }>) {
  const totalParts = Math.ceil(fileSize / partSize);
  return parts.every((part) => {
    if (!part.size || part.partNumber < 1 || part.partNumber > totalParts) return false;
    const expected = part.partNumber === totalParts ? fileSize - ((totalParts - 1) * partSize) : partSize;
    return part.size === expected;
  });
}
