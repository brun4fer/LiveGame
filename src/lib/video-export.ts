import type { MatchDetail, MomentRecord, SubMomentRecord } from "@/lib/domain";
import { formatTime } from "@/lib/time";

type ExportMomentClipInput = {
  sourceUrl: string;
  match: Pick<MatchDetail, "title" | "opponentName" | "competition">;
  moment: MomentRecord;
  onStatus?: (status: string) => void;
  quality?: ExportQuality;
};

type ExportMomentClipResult = {
  blob: Blob;
  fileName: string;
  mimeType: string;
};

type AudioExportResources = {
  audioContext: AudioContext;
};

export type ExportQuality = "original" | "high" | "standard";

export const exportQualityOptions: { value: ExportQuality; label: string; detail: string }[] = [
  { value: "original", label: "Original", detail: "Direct cuts keep the source; exact fallback uses 30 Mbps" },
  { value: "high", label: "High quality", detail: "Direct cuts keep the source; exact fallback uses 18 Mbps" },
  { value: "standard", label: "Standard", detail: "Direct cuts keep the source; exact fallback uses 9 Mbps" },
];

const qualitySettings: Record<ExportQuality, { maxWidth: number | null; frameRate: number; videoBitsPerSecond: number; audioBitsPerSecond: number }> = {
  original: { maxWidth: null, frameRate: 60, videoBitsPerSecond: 30_000_000, audioBitsPerSecond: 256_000 },
  high: { maxWidth: 1920, frameRate: 50, videoBitsPerSecond: 18_000_000, audioBitsPerSecond: 192_000 },
  standard: { maxWidth: 1920, frameRate: 30, videoBitsPerSecond: 9_000_000, audioBitsPerSecond: 160_000 },
};

export async function exportMomentClip({
  sourceUrl,
  match,
  moment,
  onStatus,
  quality = "high",
}: ExportMomentClipInput): Promise<ExportMomentClipResult> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser does not support video export.");
  }

  const mimeType = getSupportedVideoMimeType();
  if (!mimeType) {
    throw new Error("This browser does not support MP4/H.264 export. Use a recent version of Chrome or Edge.");
  }

  onStatus?.("Preparing video...");

  const sourceVideo = document.createElement("video");
  sourceVideo.preload = "auto";
  sourceVideo.playsInline = true;
  sourceVideo.src = sourceUrl;

  let animationFrame = 0;
  let outputStream: MediaStream | null = null;
  let audioResources: AudioExportResources | null = null;

  try {
    await waitForMediaEvent(sourceVideo, "loadedmetadata");

    const mediaDuration = Number.isFinite(sourceVideo.duration) ? sourceVideo.duration : moment.endTimeSeconds;
    if (moment.startTimeSeconds >= mediaDuration) {
      throw new Error("The clip is outside the selected video duration.");
    }

    const start = Math.max(0, Math.min(moment.startTimeSeconds, mediaDuration));
    const end = Math.max(start + 0.1, Math.min(moment.endTimeSeconds, mediaDuration));
    const clipDuration = end - start;
    const canvas = document.createElement("canvas");
    const exportSettings = qualitySettings[quality];
    const dimensions = getExportDimensions(sourceVideo.videoWidth, sourceVideo.videoHeight, exportSettings.maxWidth);
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not prepare the video for export.");
    }

    outputStream = canvas.captureStream(exportSettings.frameRate);
    audioResources = await addAudioToStream(sourceVideo, outputStream);
    if (!audioResources) {
      sourceVideo.muted = true;
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(outputStream, {
      mimeType,
      videoBitsPerSecond: exportSettings.videoBitsPerSecond,
      audioBitsPerSecond: exportSettings.audioBitsPerSecond,
    });
    const recording = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onerror = () => reject(new Error("Could not record the clip."));
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
        if (blob.size === 0) {
          reject(new Error("The export finished without video data."));
          return;
        }
        resolve(blob);
      };
    });

    await seekVideo(sourceVideo, start);

    let lastProgressSecond = -1;
    const draw = () => {
      const elapsed = Math.max(0, Math.min(sourceVideo.currentTime - start, clipDuration));
      drawFrame(context, sourceVideo, canvas.width, canvas.height, {
        match,
        moment,
        start,
        end,
        progress: clipDuration > 0 ? elapsed / clipDuration : 1,
      });

      const progressSecond = Math.floor(elapsed);
      if (progressSecond !== lastProgressSecond) {
        lastProgressSecond = progressSecond;
        onStatus?.(`Exporting ${formatTime(elapsed)} / ${formatTime(clipDuration)}...`);
      }

      if (sourceVideo.ended || sourceVideo.currentTime >= end) {
        sourceVideo.pause();
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
        return;
      }

      animationFrame = requestAnimationFrame(draw);
    };

    recorder.start(250);
    await sourceVideo.play();
    draw();

    const blob = await recording;
    const outputMimeType = blob.type || mimeType;
    return {
      blob,
      fileName: buildClipFileName(match, moment, extensionForMimeType(outputMimeType)),
      mimeType: outputMimeType,
    };
  } finally {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
    sourceVideo.pause();
    sourceVideo.removeAttribute("src");
    sourceVideo.load();
    outputStream?.getTracks().forEach((track) => track.stop());
    await audioResources?.audioContext.close();
  }
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function getSupportedVideoMimeType() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

async function addAudioToStream(video: HTMLVideoElement, stream: MediaStream): Promise<AudioExportResources | null> {
  const AudioContextConstructor =
    window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  try {
    const audioContext = new AudioContextConstructor();
    const sourceNode = audioContext.createMediaElementSource(video);
    const destination = audioContext.createMediaStreamDestination();
    sourceNode.connect(destination);
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    return { audioContext };
  } catch {
    return null;
  }
}

function getExportDimensions(videoWidth: number, videoHeight: number, maxWidth: number | null) {
  const sourceWidth = videoWidth || 1280;
  const sourceHeight = videoHeight || 720;
  const scale = maxWidth ? Math.min(1, maxWidth / sourceWidth) : 1;

  return {
    width: Math.max(2, Math.round(sourceWidth * scale)),
    height: Math.max(2, Math.round(sourceHeight * scale)),
  };
}

function drawFrame(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  data: {
    match: Pick<MatchDetail, "title" | "opponentName" | "competition">;
    moment: MomentRecord;
    start: number;
    end: number;
    progress: number;
  },
) {
  context.clearRect(0, 0, width, height);
  context.drawImage(video, 0, 0, width, height);
  // Keep the exported clip identical to the source video: no titles,
  // analysis summary, progress bar or other visual overlays.
  void data;
}

export function drawOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  {
    match,
    moment,
    start,
    end,
    progress,
  }: {
    match: Pick<MatchDetail, "title" | "opponentName" | "competition">;
    moment: MomentRecord;
    start: number;
    end: number;
    progress: number;
  },
) {
  const margin = clampNumber(Math.round(width * 0.025), 18, 42);
  const panelWidth = clampNumber(Math.round(width * 0.4), 390, Math.max(390, width - margin * 2));
  const padding = clampNumber(Math.round(width * 0.014), 14, 26);
  const titleSize = clampNumber(Math.round(width * 0.018), 20, 34);
  const bodySize = clampNumber(Math.round(width * 0.012), 14, 21);
  const smallSize = clampNumber(Math.round(width * 0.01), 12, 17);
  const lineHeight = Math.round(bodySize * 1.35);
  const maxTextWidth = panelWidth - padding * 2;
  const subMomentLines = buildSubMomentLines(moment.subMoments);
  const dataLines = [
    match.title,
    `Opponent: ${match.opponentName}`,
    match.competition ? `Competition: ${match.competition}` : null,
    `Time: ${formatTime(start)} - ${formatTime(end)}`,
    `Duration: ${formatTime(end - start)}`,
    moment.notes ? `Notes: ${moment.notes}` : null,
  ].filter(Boolean) as string[];

  context.save();
  context.textBaseline = "top";
  context.font = `700 ${titleSize}px system-ui, sans-serif`;
  const titleLines = wrapText(context, `${moment.momentType.code} | ${moment.momentType.name}`, maxTextWidth);

  context.font = `500 ${bodySize}px system-ui, sans-serif`;
  const wrappedDataLines = dataLines.flatMap((line) => wrapText(context, line, maxTextWidth));

  context.font = `500 ${smallSize}px system-ui, sans-serif`;
  const wrappedSubMomentLines = subMomentLines.flatMap((line) => wrapText(context, line, maxTextWidth));
  const visibleSubMomentLines = wrappedSubMomentLines.slice(0, 8);

  const panelHeight =
    padding * 2 +
    titleLines.length * Math.round(titleSize * 1.25) +
    10 +
    wrappedDataLines.length * lineHeight +
    (visibleSubMomentLines.length > 0 ? 14 + smallSize + 6 + visibleSubMomentLines.length * Math.round(smallSize * 1.35) : 0);

  drawRoundedRect(context, margin, margin, panelWidth, panelHeight, 10, "rgba(4, 8, 18, 0.74)");

  let y = margin + padding;
  context.font = `700 ${titleSize}px system-ui, sans-serif`;
  context.fillStyle = moment.momentType.color;
  for (const line of titleLines) {
    context.fillText(line, margin + padding, y);
    y += Math.round(titleSize * 1.25);
  }

  y += 10;
  context.font = `500 ${bodySize}px system-ui, sans-serif`;
  context.fillStyle = "#f8fafc";
  for (const line of wrappedDataLines) {
    context.fillText(line, margin + padding, y);
    y += lineHeight;
  }

  if (visibleSubMomentLines.length > 0) {
    y += 14;
    context.font = `700 ${smallSize}px system-ui, sans-serif`;
    context.fillStyle = "#bae6fd";
    context.fillText("Submoments", margin + padding, y);
    y += smallSize + 6;
    context.font = `500 ${smallSize}px system-ui, sans-serif`;
    context.fillStyle = "#dbeafe";
    for (const line of visibleSubMomentLines) {
      context.fillText(line, margin + padding, y);
      y += Math.round(smallSize * 1.35);
    }
  }

  const progressHeight = clampNumber(Math.round(height * 0.012), 8, 14);
  context.fillStyle = "rgba(4, 8, 18, 0.82)";
  context.fillRect(0, height - progressHeight, width, progressHeight);
  context.fillStyle = moment.momentType.color;
  context.fillRect(0, height - progressHeight, width * clampNumber(progress, 0, 1), progressHeight);
  context.restore();
}

function buildSubMomentLines(subMoments: SubMomentRecord[]) {
  if (subMoments.length === 0) {
    return [];
  }

  const lines = subMoments.slice(0, 6).map((subMoment) => {
    const pieces = [subMoment.subMomentType.name];
    if (subMoment.timeSeconds !== null) {
      pieces.push(formatTime(subMoment.timeSeconds));
    }
    if (subMoment.fieldX !== null && subMoment.fieldY !== null) {
      pieces.push(`field ${formatPoint(subMoment.fieldX, subMoment.fieldY)}`);
    }
    if (subMoment.goalX !== null && subMoment.goalY !== null) {
      pieces.push(`goal ${formatPoint(subMoment.goalX, subMoment.goalY)}`);
    }
    return pieces.join(" | ");
  });

  if (subMoments.length > 6) {
    lines.push(`+${subMoments.length - 6} submoments`);
  }

  return lines;
}

function formatPoint(x: number, y: number) {
  return `${Math.round(x)}%, ${Math.round(y)}%`;
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !currentLine) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
  context.fillStyle = fillStyle;
  context.fill();
}

function waitForMediaEvent(element: HTMLMediaElement, eventName: keyof HTMLMediaElementEventMap) {
  if (eventName === "loadedmetadata" && element.readyState >= 1) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while reading the video."));
    }, 15_000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      element.removeEventListener(eventName, handleSuccess);
      element.removeEventListener("error", handleError);
    };

    const handleSuccess = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Could not read the selected video."));
    };

    element.addEventListener(eventName, handleSuccess, { once: true });
    element.addEventListener("error", handleError, { once: true });
  });
}

async function seekVideo(video: HTMLVideoElement, seconds: number) {
  video.currentTime = seconds;
  await Promise.race([waitForMediaEvent(video, "seeked"), wait(250)]);
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

export function buildClipFileName(match: Pick<MatchDetail, "title">, moment: MomentRecord, extension: string) {
  const title = sanitizeFileName(match.title) || "match";
  const time = formatTime(moment.startTimeSeconds).replace(/:/g, "-");
  return `${title}-${moment.momentType.code}-${time}.${extension}`;
}

export function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function extensionForMimeType(mimeType: string) {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

