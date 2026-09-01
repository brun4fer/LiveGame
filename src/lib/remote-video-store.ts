import { apiFetch } from "@/lib/http";

export type VideoStorageStatus = "LOCAL" | "UPLOADING" | "READY" | "FAILED";

export type StoredVideo = {
  fileName: string;
  fileSize: number;
  durationSeconds: number;
  mimeType: string;
  storageStatus: VideoStorageStatus;
  uploadedAt?: string | null;
};

export type CloudVideoAsset = {
  id: string;
  fileName: string;
  fileSize: string;
  durationSeconds: number;
  mimeType: string;
  storageStatus: "READY";
  etag?: string | null;
  uploadedAt?: string | null;
  createdAt: string;
};

type UploadStatus = { phase: "preparing" | "uploading" | "finishing"; progress: number; detail: string };
type UploadedPart = { partNumber: number; etag: string; size?: number };

export async function getRemoteVideoUrl(matchId: string) {
  return apiFetch<{ url: string; expiresAt: string }>(`/api/matches/${matchId}/video`);
}

export async function getCloudVideoLibrary() {
  return apiFetch<{ assets: CloudVideoAsset[] }>("/api/media-library");
}

export async function attachCloudVideo(matchId: string, mediaAssetId: string) {
  return apiFetch<{ video: StoredVideo }>(`/api/matches/${matchId}/video/library`, {
    method: "POST",
    body: JSON.stringify({ mediaAssetId }),
  });
}

export async function readVideoDuration(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Timed out while reading the video metadata.")), 30_000);
      video.onloadedmetadata = () => { window.clearTimeout(timeout); resolve(); };
      video.onerror = () => { window.clearTimeout(timeout); reject(new Error("Could not read the selected video.")); };
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("The selected video has an invalid duration.");
    return video.duration;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function uploadMatchVideo(matchId: string, file: File, onStatus?: (status: UploadStatus) => void, signal?: AbortSignal) {
  onStatus?.({ phase: "preparing", progress: 0, detail: "Preparing multipart upload…" });
  const durationSeconds = await readVideoDuration(file);
  const init = await apiFetch<{
    video: StoredVideo;
    uploadId: string | null;
    partSize: number;
    completedParts: UploadedPart[];
    alreadyReady: boolean;
  }>(`/api/matches/${matchId}/video/uploads`, {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      durationSeconds,
      mimeType: file.type || "video/mp4",
      lastModified: new Date(file.lastModified).toISOString(),
    }),
  });
  if (init.alreadyReady) return { video: init.video, durationSeconds, resumed: false };
  if (!init.uploadId) throw new Error("The server did not start the multipart upload.");

  const totalParts = Math.ceil(file.size / init.partSize);
  const completed = new Map(init.completedParts.map((part) => [part.partNumber, part]));
  const partProgress = new Map<number, number>();
  for (const part of init.completedParts) partProgress.set(part.partNumber, part.size || partLength(file.size, init.partSize, part.partNumber));
  const missing = Array.from({ length: totalParts }, (_, index) => index + 1).filter((partNumber) => !completed.has(partNumber));
  const emitProgress = (detail: string) => {
    const uploaded = [...partProgress.values()].reduce((sum, value) => sum + value, 0);
    onStatus?.({ phase: "uploading", progress: Math.min(1, uploaded / file.size), detail });
  };
  emitProgress(init.completedParts.length ? `Resuming after ${init.completedParts.length} completed parts…` : `Uploading ${totalParts} parts…`);

  try {
    if (missing.length) {
      const signedParts: Array<{ partNumber: number; url: string }> = [];
      for (let index = 0; index < missing.length; index += 500) {
        const signed = await apiFetch<{ parts: Array<{ partNumber: number; url: string }> }>(`/api/matches/${matchId}/video/uploads/parts`, {
          method: "POST",
          body: JSON.stringify({ uploadId: init.uploadId, partNumbers: missing.slice(index, index + 500) }),
        });
        signedParts.push(...signed.parts);
      }
      let cursor = 0;
      const workers = Array.from({ length: Math.min(3, signedParts.length) }, async () => {
        while (cursor < signedParts.length) {
          const current = signedParts[cursor++];
          const start = (current.partNumber - 1) * init.partSize;
          const blob = file.slice(start, Math.min(file.size, start + init.partSize));
          const etag = await uploadPartWithRetry(current.url, blob, (loaded) => {
            partProgress.set(current.partNumber, loaded);
            emitProgress(`Uploading part ${current.partNumber} of ${totalParts}…`);
          }, signal);
          const part = { partNumber: current.partNumber, etag, size: blob.size };
          completed.set(current.partNumber, part);
          partProgress.set(current.partNumber, blob.size);
          emitProgress(`Uploaded ${completed.size} of ${totalParts} parts.`);
        }
      });
      await Promise.all(workers);
    }
    onStatus?.({ phase: "finishing", progress: 1, detail: "Finalizing the video in Cloudflare R2…" });
    const result = await apiFetch<{ video: StoredVideo }>(`/api/matches/${matchId}/video/uploads/complete`, {
      method: "POST",
      body: JSON.stringify({ uploadId: init.uploadId, parts: [...completed.values()].map(({ partNumber, etag }) => ({ partNumber, etag })) }),
    });
    return { video: result.video, durationSeconds, resumed: init.completedParts.length > 0 };
  } catch (error) {
    if (signal?.aborted) {
      await apiFetch(`/api/matches/${matchId}/video/uploads`, { method: "DELETE", body: JSON.stringify({ uploadId: init.uploadId }) }).catch(() => undefined);
      throw new DOMException("The video upload was cancelled.", "AbortError");
    }
    throw new Error(`${error instanceof Error ? error.message : "The upload was interrupted."} Select the same file again to resume it.`);
  }
}

function partLength(fileSize: number, partSize: number, partNumber: number) {
  return Math.max(0, Math.min(partSize, fileSize - (partNumber - 1) * partSize));
}

async function uploadPartWithRetry(url: string, blob: Blob, onProgress: (loaded: number) => void, signal?: AbortSignal) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await uploadPart(url, blob, onProgress, signal); }
    catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("A video part could not be uploaded.");
}

function uploadPart(url: string, blob: Blob, onProgress: (loaded: number) => void, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    request.open("PUT", url);
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onload = () => {
      cleanup();
      if (request.status < 200 || request.status >= 300) return reject(new Error(`Cloudflare rejected a video part (${request.status}).`));
      const etag = request.getResponseHeader("ETag");
      if (!etag) return reject(new Error("Cloudflare did not return the ETag for an uploaded part. Check the bucket CORS policy."));
      resolve(etag);
    };
    request.onerror = () => { cleanup(); reject(new Error("A network error interrupted the video upload.")); };
    request.onabort = () => { cleanup(); reject(new DOMException("The upload was cancelled.", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) return abort();
    request.send(blob);
  });
}

