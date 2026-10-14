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
