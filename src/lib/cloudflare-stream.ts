type CloudflareLiveInput = {
  uid?: string;
  webRTC?: { url?: string };
  webRTCPlayback?: { url?: string };
};

type CloudflareResponse<T> = {
  success: boolean;
  result?: T;
  errors?: Array<{ message?: string }>;
};

export type RealtimeLiveInput = {
  id: string;
  publishUrl: string;
  playbackUrl: string;
};

function streamConfig() {
  const accountId = process.env.CLOUDFLARE_STREAM_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN?.trim();
  if (!accountId && !apiToken) return null;
  if (!accountId || !apiToken) throw new Error("Cloudflare Stream is only partially configured.");
  return { accountId, apiToken };
}

async function streamRequest<T>(path: string, init?: RequestInit) {
  const config = streamConfig();
  if (!config) return null;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as CloudflareResponse<T> | null;
  if (!response.ok || !payload?.success || !payload.result) {
    const detail = payload?.errors?.map((error) => error.message).filter(Boolean).join(" ");
    throw new Error(detail || `Cloudflare Stream request failed (${response.status}).`);
  }
  return payload.result;
}

function normalizeLiveInput(input: CloudflareLiveInput): RealtimeLiveInput {
  const id = input.uid?.trim();
  const publishUrl = input.webRTC?.url?.trim();
  const playbackUrl = input.webRTCPlayback?.url?.trim();
  if (!id || !publishUrl || !playbackUrl) throw new Error("Cloudflare Stream did not return the WebRTC live input addresses.");
  return { id, publishUrl, playbackUrl };
}

export function cloudflareStreamConfigured() {
  return Boolean(streamConfig());
}

export async function createRealtimeLiveInput(input: { name: string; matchId: string; workspaceId: string }) {
  const recordingMode = process.env.CLOUDFLARE_STREAM_RECORDING_MODE === "automatic" ? "automatic" : "off";
  const allowedOrigins = process.env.CLOUDFLARE_STREAM_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const result = await streamRequest<CloudflareLiveInput>("/live_inputs", {
    method: "POST",
    body: JSON.stringify({
      enabled: true,
      preferLowLatency: true,
      meta: { name: input.name, liveGameMatchId: input.matchId, liveGameWorkspaceId: input.workspaceId },
      recording: {
        mode: recordingMode,
        hideLiveViewerCount: true,
        requireSignedURLs: false,
        timeoutSeconds: 0,
        ...(allowedOrigins?.length ? { allowedOrigins } : {}),
      },
    }),
  });
  if (!result) return null;
  return normalizeLiveInput(result);
}

export async function getRealtimeLiveInput(id: string) {
  const result = await streamRequest<CloudflareLiveInput>(`/live_inputs/${encodeURIComponent(id)}`);
  if (!result) return null;
  return normalizeLiveInput(result);
}
