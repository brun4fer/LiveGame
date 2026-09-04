import assert from "node:assert/strict";
import test from "node:test";

import { cloudflareStreamConfigured, createRealtimeLiveInput } from "@/lib/cloudflare-stream";

const originalAccountId = process.env.CLOUDFLARE_STREAM_ACCOUNT_ID;
const originalApiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
const originalEnabled = process.env.CLOUDFLARE_STREAM_ENABLED;
const originalRecordingMode = process.env.CLOUDFLARE_STREAM_RECORDING_MODE;
const originalAllowedOrigins = process.env.CLOUDFLARE_STREAM_ALLOWED_ORIGINS;
const originalFetch = global.fetch;

function restoreEnvironment() {
  if (originalEnabled === undefined) delete process.env.CLOUDFLARE_STREAM_ENABLED;
  else process.env.CLOUDFLARE_STREAM_ENABLED = originalEnabled;
  if (originalAccountId === undefined) delete process.env.CLOUDFLARE_STREAM_ACCOUNT_ID;
  else process.env.CLOUDFLARE_STREAM_ACCOUNT_ID = originalAccountId;
  if (originalApiToken === undefined) delete process.env.CLOUDFLARE_STREAM_API_TOKEN;
  else process.env.CLOUDFLARE_STREAM_API_TOKEN = originalApiToken;
  if (originalRecordingMode === undefined) delete process.env.CLOUDFLARE_STREAM_RECORDING_MODE;
  else process.env.CLOUDFLARE_STREAM_RECORDING_MODE = originalRecordingMode;
  if (originalAllowedOrigins === undefined) delete process.env.CLOUDFLARE_STREAM_ALLOWED_ORIGINS;
  else process.env.CLOUDFLARE_STREAM_ALLOWED_ORIGINS = originalAllowedOrigins;
  global.fetch = originalFetch;
}

test.afterEach(restoreEnvironment);

test("keeps realtime streaming optional when Stream credentials are absent", async () => {
  delete process.env.CLOUDFLARE_STREAM_ENABLED;
  delete process.env.CLOUDFLARE_STREAM_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_STREAM_API_TOKEN;
  assert.equal(cloudflareStreamConfigured(), false);
  assert.equal(await createRealtimeLiveInput({ name: "Test", matchId: "match", workspaceId: "workspace" }), null);
});

test("does not contact Stream unless realtime sharing is explicitly enabled", async () => {
  process.env.CLOUDFLARE_STREAM_ENABLED = "false";
  process.env.CLOUDFLARE_STREAM_ACCOUNT_ID = "account-id";
  process.env.CLOUDFLARE_STREAM_API_TOKEN = "stream-secret";
  global.fetch = (async () => { throw new Error("Stream should not be contacted."); }) as typeof fetch;

  assert.equal(cloudflareStreamConfigured(), false);
  assert.equal(await createRealtimeLiveInput({ name: "Test", matchId: "match", workspaceId: "workspace" }), null);
});

test("creates a private server-side Cloudflare Stream WebRTC input", async () => {
  process.env.CLOUDFLARE_STREAM_ENABLED = "true";
  process.env.CLOUDFLARE_STREAM_ACCOUNT_ID = "account-id";
  process.env.CLOUDFLARE_STREAM_API_TOKEN = "stream-secret";
  process.env.CLOUDFLARE_STREAM_RECORDING_MODE = "off";
  process.env.CLOUDFLARE_STREAM_ALLOWED_ORIGINS = "live.example.com, localhost:3000";

  let request: { url: string; init?: RequestInit } | null = null;
  global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    request = { url: String(url), init };
    return Response.json({
      success: true,
      result: {
        uid: "input-id",
        webRTC: { url: "https://stream.example/publish-secret/webRTC/publish" },
        webRTCPlayback: { url: "https://stream.example/input-id/webRTC/play" },
      },
    });
  }) as typeof fetch;

  const result = await createRealtimeLiveInput({ name: "Benfica vs Porto", matchId: "match-id", workspaceId: "workspace-id" });
  assert.deepEqual(result, {
    id: "input-id",
    publishUrl: "https://stream.example/publish-secret/webRTC/publish",
    playbackUrl: "https://stream.example/input-id/webRTC/play",
  });
  assert.ok(request);
  const sent = request as { url: string; init?: RequestInit };
  assert.equal(sent.url, "https://api.cloudflare.com/client/v4/accounts/account-id/stream/live_inputs");
  assert.equal(new Headers(sent.init?.headers).get("Authorization"), "Bearer stream-secret");
  const body = JSON.parse(String(sent.init?.body));
  assert.equal(body.recording.mode, "off");
  assert.deepEqual(body.recording.allowedOrigins, ["live.example.com", "localhost:3000"]);
  assert.equal(body.meta.liveGameMatchId, "match-id");
});
