export type ExportDirectory = FileSystemDirectoryHandle;

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
};

export async function pickExportDirectory(): Promise<ExportDirectory | null> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) return null;
  return picker({ mode: "readwrite" });
}

export async function writeBlobToDirectory(directory: ExportDirectory, path: string, blob: Blob) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) throw new Error("The export file path is empty.");

  let current = directory;
  for (const part of parts.slice(0, -1)) {
    current = await current.getDirectoryHandle(part, { create: true });
  }

  const fileHandle = await current.getFileHandle(parts.at(-1) as string, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

export function isExportPickerCancellation(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

