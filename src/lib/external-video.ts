export function getYouTubeVideoId(value: string) {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return validVideoId(url.pathname.split("/").filter(Boolean)[0]);
    if (host !== "youtube.com" && host !== "m.youtube.com") return null;
    if (url.pathname === "/watch") return validVideoId(url.searchParams.get("v"));
    const [section, id] = url.pathname.split("/").filter(Boolean);
    if (["live", "embed", "shorts"].includes(section)) return validVideoId(id);
  } catch {
    return null;
  }
  return null;
}

function validVideoId(value: string | null | undefined) {
  return value && /^[a-zA-Z0-9_-]{6,20}$/.test(value) ? value : null;
}

export function normalizeYouTubeUrl(value: string) {
  const id = getYouTubeVideoId(value);
  if (!id) throw new Error("Enter a valid YouTube video or live-stream link.");
  return `https://www.youtube.com/watch?v=${id}`;
}

export function getYouTubeEmbedUrl(value: string, soundEnabled = false) {
  const id = getYouTubeVideoId(value);
  if (!id) return null;
  const query = new URLSearchParams({ autoplay: "1", playsinline: "1", rel: "0", mute: soundEnabled ? "0" : "1" });
  return `https://www.youtube.com/embed/${id}?${query}`;
}

export type ExternalVideoKind = "youtube" | "direct" | "embed" | "invalid";

/**
 * A direct source can be played by the native video element and, when its
 * server exposes CORS headers, can also be exported in the browser. A normal
 * web page is deliberately kept separate: it may be embeddable, but its
 * timeline and pixels are not accessible to us.
 */
export function getExternalVideoKind(value: string): ExternalVideoKind {
  const raw = value.trim();
  if (getYouTubeVideoId(raw)) return "youtube";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "invalid";
    const path = url.pathname.toLowerCase();
    if (/\.(mp4|webm|ogv|ogg|mov|m4v|m3u8)(?:$|\/)/.test(path)) return "direct";
    return "embed";
  } catch {
    return "invalid";
  }
}

export function supportsExternalClipExport(value: string) {
  return getExternalVideoKind(value) === "direct";
}
