import assert from "node:assert/strict";
import test from "node:test";

import { shouldUploadReplayFromOrigin } from "./replay-upload-origin";

test("uploads replay segments from HTTPS and localhost", () => {
  assert.equal(shouldUploadReplayFromOrigin({ protocol: "https:", hostname: "live-game.example" } as Location), true);
  assert.equal(shouldUploadReplayFromOrigin({ protocol: "http:", hostname: "localhost" } as Location), true);
});

test("keeps insecure LAN development replay local", () => {
  assert.equal(shouldUploadReplayFromOrigin({ protocol: "http:", hostname: "192.168.1.153" } as Location), false);
});
