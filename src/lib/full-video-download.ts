type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
};

type SaveVideoOptions = {
  file?: File | null;
  remoteUrl?: string | null;
  resolveRemoteUrl?: () => Promise<string>;
  fileName: string;
  mimeType?: string | null;
  onProgress?: (progress: number | null) => void;
};

export async function saveFullVideo({ file, remoteUrl, resolveRemoteUrl, fileName, mimeType, onProgress }: SaveVideoOptions) {
  if (!file && !remoteUrl && !resolveRemoteUrl) throw new Error("The complete match video is not available yet.");

  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (!picker) {
    const resolvedRemoteUrl = remoteUrl || await resolveRemoteUrl?.();
    const anchor = document.createElement("a");
    const objectUrl = file ? URL.createObjectURL(file) : null;
    anchor.href = objectUrl || resolvedRemoteUrl!;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    return;
  }

  const handle = await picker({
    suggestedName: fileName,
    types: [{
      description: "MP4 video",
      accept: { [mimeType?.startsWith("video/") ? mimeType.split(";", 1)[0] : "video/mp4"]: [fileName.toLowerCase().endsWith(".webm") ? ".webm" : ".mp4"] },
    }],
  });
  const writable = await handle.createWritable();

  try {
    if (file) {
      onProgress?.(0);
      await file.stream().pipeTo(writable);
      onProgress?.(1);
      return;
    }

    const resolvedRemoteUrl = remoteUrl || await resolveRemoteUrl?.();
    if (!resolvedRemoteUrl) throw new Error("The complete match video is not available yet.");
    const response = await fetch(resolvedRemoteUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Cloudflare rejected the video download (${response.status}).`);
    if (!response.body) throw new Error("This browser could not read the video download.");

    const total = Number(response.headers.get("content-length") || 0);
    const reader = response.body.getReader();
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      received += value.byteLength;
      onProgress?.(total > 0 ? Math.min(1, received / total) : null);
    }
    await writable.close();
    onProgress?.(1);
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

export function isFilePickerCancellation(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
