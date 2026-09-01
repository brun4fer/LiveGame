type SerializableVideo = {
  fileSize: bigint;
  storageKey?: string | null;
  uploadId?: string | null;
};

export function serializeVideo<T extends SerializableVideo>(video: T) {
  const safe = { ...video, fileSize: Number(video.fileSize) };
  delete safe.storageKey;
  delete safe.uploadId;
  return safe;
}

