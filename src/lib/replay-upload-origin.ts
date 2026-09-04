export function shouldUploadReplayFromOrigin(origin: Pick<Location, "protocol" | "hostname">) {
  if (origin.protocol === "https:") return true;
  return origin.hostname === "localhost" || origin.hostname === "127.0.0.1" || origin.hostname === "::1";
}
