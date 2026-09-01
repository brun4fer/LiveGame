const DATABASE_NAME = "analise-equipa-local-videos";
const STORE_NAME = "match-videos";
const VERSION = 1;
export const MAX_PERSISTED_VIDEO_SIZE = 1024 * 1024 * 1024;

type StoredVideo = { matchId: string; file: File; savedAt: number };

// Multi-GB videos remain available while navigating inside the same browser
// session without being copied into IndexedDB or uploaded to the server.
const sessionVideos = new Map<string, File>();

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Local video storage is not available in this browser."));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "matchId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local storage."));
  });
}

export async function rememberMatchVideo(matchId: string, file: File) {
  sessionVideos.set(matchId, file);

  if (file.size > MAX_PERSISTED_VIDEO_SIZE) return;

  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ matchId, file, savedAt: Date.now() } satisfies StoredVideo);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Could not save the video in the browser."));
      transaction.onabort = () => reject(transaction.error || new Error("The browser does not have enough storage space."));
    });
  } finally {
    database.close();
  }
}

export function videoPersistsAfterRestart(file: Pick<File, "size">) {
  return file.size <= MAX_PERSISTED_VIDEO_SIZE;
}

export async function getRememberedMatchVideo(matchId: string) {
  const sessionFile = sessionVideos.get(matchId);
  if (sessionFile) return sessionFile;

  const database = await openDatabase();
  try {
    const file = await new Promise<File | null>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(matchId);
      request.onsuccess = () => resolve((request.result as StoredVideo | undefined)?.file || null);
      request.onerror = () => reject(request.error || new Error("Could not restore the local video."));
    });
    if (file) sessionVideos.set(matchId, file);
    return file;
  } finally {
    database.close();
  }
}

