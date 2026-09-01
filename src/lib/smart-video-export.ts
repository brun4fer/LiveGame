import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
  UrlSource,
  type EncodedPacket,
  type InputAudioTrack,
  type InputVideoTrack,
} from "mediabunny";

import type { MatchDetail, MomentRecord } from "@/lib/domain";
import {
  buildClipFileName,
  exportMomentClip as exportMomentClipLegacy,
  type ExportQuality,
} from "@/lib/video-export";

type MatchForExport = Pick<MatchDetail, "title" | "opponentName" | "competition">;

export type SmartExportMode = "direct" | "webcodecs" | "compatibility";

export type SmartExportResult = {
  blob: Blob;
  fileName: string;
  mimeType: string;
  mode: SmartExportMode;
};

type ExportMomentInput = {
  match: MatchForExport;
  moment: MomentRecord;
  quality?: ExportQuality;
  onStatus?: (status: string) => void;
  sourceUrlFallback?: string;
};

// Only remux when the saved mark is effectively on the keyframe. Otherwise an
// exact WebCodecs trim is safer than silently moving a football event boundary.
const DIRECT_CUT_TOLERANCE_SECONDS = 0.04;

const transcodeSettings: Record<ExportQuality, { videoBitrate: number; audioBitrate: number }> = {
  original: { videoBitrate: 30_000_000, audioBitrate: 256_000 },
  high: { videoBitrate: 18_000_000, audioBitrate: 192_000 },
  standard: { videoBitrate: 9_000_000, audioBitrate: 160_000 },
};

export class SmartVideoExportSession {
  private readonly input: Input;
  private videoTrackPromise: Promise<InputVideoTrack | null> | null = null;
  private audioTrackPromise: Promise<InputAudioTrack | null> | null = null;

  constructor(source: File | string) {
    this.input = new Input({
      formats: ALL_FORMATS,
      source: typeof source === "string"
        ? new UrlSource(source, { maxCacheSize: 64 * 1024 * 1024, parallelism: 2 })
        : new BlobSource(source),
    });
  }

  async validate() {
    if (!(await this.input.canRead())) {
      throw new Error("The selected video format is not supported by the fast exporter.");
    }

    const videoTrack = await this.getVideoTrack();
    if (!videoTrack) {
      throw new Error("The selected file does not contain a video track.");
    }
  }

  async exportMoment({
    match,
    moment,
    quality = "high",
    onStatus,
    sourceUrlFallback,
  }: ExportMomentInput): Promise<SmartExportResult> {
    await this.validate();

    onStatus?.("Checking whether the clip can be copied without re-encoding...");
    try {
      const direct = await this.tryDirectExport(match, moment, onStatus);
      if (direct) {
        return direct;
      }
    } catch (error) {
      console.info("Direct video export was not possible. Trying WebCodecs.", error);
    }

    onStatus?.("Encoding an exact cut with WebCodecs...");
    try {
      return await this.exportWithWebCodecs(match, moment, quality, onStatus);
    } catch (error) {
      console.info("WebCodecs export was not possible. Trying compatibility mode.", error);
      if (!sourceUrlFallback) {
        throw normalizeExportError(error);
      }
    }

    onStatus?.("Using browser compatibility mode...");
    const legacy = await exportMomentClipLegacy({
      sourceUrl: sourceUrlFallback,
      match,
      moment,
      quality,
      onStatus,
    });
    return { ...legacy, mode: "compatibility" };
  }

  dispose() {
    this.input.dispose();
  }

  private getVideoTrack() {
    this.videoTrackPromise ??= this.input.getPrimaryVideoTrack();
    return this.videoTrackPromise;
  }

  private getAudioTrack() {
    this.audioTrackPromise ??= this.input.getPrimaryAudioTrack();
    return this.audioTrackPromise;
  }

  private async tryDirectExport(
    match: MatchForExport,
    moment: MomentRecord,
    onStatus?: (status: string) => void,
  ): Promise<SmartExportResult | null> {
    const videoTrack = await this.getVideoTrack();
    if (!videoTrack) return null;

    const audioTrack = await this.getAudioTrack();
    const format = new Mp4OutputFormat({ fastStart: "in-memory" });
    const videoCodec = await videoTrack.getCodec();
    const audioCodec = await audioTrack?.getCodec();

    if (!videoCodec || !format.getSupportedVideoCodecs().includes(videoCodec)) return null;
    if (audioTrack && (!audioCodec || !format.getSupportedAudioCodecs().includes(audioCodec))) return null;

    const start = Math.max(0, moment.startTimeSeconds);
    const end = Math.max(start + 0.1, moment.endTimeSeconds);
    const videoSink = new EncodedPacketSink(videoTrack);
    const startKeyPacket = await videoSink.getKeyPacket(start, { verifyKeyPackets: true });
    if (!startKeyPacket || start - startKeyPacket.timestamp > DIRECT_CUT_TOLERANCE_SECONDS) {
      return null;
    }

    const endKeyBefore = await videoSink.getKeyPacket(end, { verifyKeyPackets: true });
    if (!endKeyBefore) return null;
    const endKeyAfter = await videoSink.getNextKeyPacket(endKeyBefore, { verifyKeyPackets: true });
    const endKeyPacket = Math.abs(endKeyBefore.timestamp - end) <= DIRECT_CUT_TOLERANCE_SECONDS
      ? endKeyBefore
      : endKeyAfter && Math.abs(endKeyAfter.timestamp - end) <= DIRECT_CUT_TOLERANCE_SECONDS
        ? endKeyAfter
        : null;
    if (!endKeyPacket || endKeyPacket.timestamp <= startKeyPacket.timestamp) return null;

    const directStart = startKeyPacket.timestamp;
    const directEnd = endKeyPacket.timestamp;
    const target = new BufferTarget();
    const output = new Output({ format, target });
    const videoSource = new EncodedVideoPacketSource(videoCodec);
    output.addVideoTrack(videoSource, {
      rotation: await videoTrack.getRotation(),
      languageCode: await videoTrack.getLanguageCode(),
      name: (await videoTrack.getName()) ?? undefined,
      disposition: await videoTrack.getDisposition(),
    });

    let audioSource: EncodedAudioPacketSource | null = null;
    let audioSink: EncodedPacketSink | null = null;
    if (audioTrack && audioCodec) {
      audioSource = new EncodedAudioPacketSource(audioCodec);
      audioSink = new EncodedPacketSink(audioTrack);
      output.addAudioTrack(audioSource, {
        languageCode: await audioTrack.getLanguageCode(),
        name: (await audioTrack.getName()) ?? undefined,
        disposition: await audioTrack.getDisposition(),
      });
    }

    await output.start();
    onStatus?.("Copying the original video data without quality loss...");

    try {
      const videoConfig = await videoTrack.getDecoderConfig();
      const audioConfig = await audioTrack?.getDecoderConfig();
      await Promise.all([
        copyPackets({
          sink: videoSink,
          source: videoSource,
          startPacket: startKeyPacket,
          endPacket: endKeyPacket,
          start: directStart,
          metadata: videoConfig ? { decoderConfig: videoConfig } : undefined,
          onProgress: (time) => onStatus?.(`Direct cut: ${Math.min(100, Math.round(100 * time / (directEnd - directStart)))}%`),
        }),
        audioSource && audioSink
          ? copyAudioPackets({
              sink: audioSink,
              source: audioSource,
              start: directStart,
              end: directEnd,
              metadata: audioConfig ? { decoderConfig: audioConfig } : undefined,
            })
          : Promise.resolve(),
      ]);
      await output.finalize();
    } catch (error) {
      await output.cancel().catch(() => undefined);
      throw error;
    }

    if (!target.buffer || target.buffer.byteLength === 0) {
      throw new Error("The direct cut finished without video data.");
    }

    return {
      blob: new Blob([target.buffer], { type: "video/mp4" }),
      fileName: buildClipFileName(match, moment, "mp4"),
      mimeType: "video/mp4",
      mode: "direct",
    };
  }

  private async exportWithWebCodecs(
    match: MatchForExport,
    moment: MomentRecord,
    quality: ExportQuality,
    onStatus?: (status: string) => void,
  ): Promise<SmartExportResult> {
    if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") {
      throw new Error("WebCodecs is not available in this browser.");
    }

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const settings = transcodeSettings[quality];
    const start = Math.max(0, moment.startTimeSeconds);
    const end = Math.max(start + 0.1, moment.endTimeSeconds);
    const conversion = await Conversion.init({
      input: this.input,
      output,
      tracks: "primary",
      trim: { start, end },
      video: {
        codec: "avc",
        bitrate: settings.videoBitrate,
        keyFrameInterval: 2,
        hardwareAcceleration: "no-preference",
      },
      audio: {
        codec: "aac",
        bitrate: settings.audioBitrate,
      },
      showWarnings: false,
    });

    if (!conversion.isValid) {
      const reasons = [...new Set(conversion.discardedTracks.map((item) => item.reason))].join(", ");
      throw new Error(`WebCodecs cannot export this video${reasons ? ` (${reasons})` : ""}.`);
    }

    conversion.onProgress = (progress) => {
      onStatus?.(`Exact cut with WebCodecs: ${Math.min(100, Math.round(progress * 100))}%`);
    };
    await conversion.execute();

    if (!target.buffer || target.buffer.byteLength === 0) {
      throw new Error("WebCodecs finished without video data.");
    }

    return {
      blob: new Blob([target.buffer], { type: "video/mp4" }),
      fileName: buildClipFileName(match, moment, "mp4"),
      mimeType: "video/mp4",
      mode: "webcodecs",
    };
  }
}

type PacketCopyInput = {
  sink: EncodedPacketSink;
  source: EncodedVideoPacketSource;
  startPacket: EncodedPacket;
  endPacket: EncodedPacket;
  start: number;
  metadata?: EncodedVideoChunkMetadata;
  onProgress?: (time: number) => void;
};

async function copyPackets({ sink, source, startPacket, endPacket, start, metadata, onProgress }: PacketCopyInput) {
  let first = true;
  try {
    for await (const packet of sink.packets(startPacket, endPacket)) {
      const shifted = packet.clone({ timestamp: Math.max(0, packet.timestamp - start) });
      await source.add(shifted, first ? metadata : undefined);
      first = false;
      onProgress?.(packet.timestamp + packet.duration - start);
    }
  } finally {
    source.close();
  }
}

type AudioPacketCopyInput = {
  sink: EncodedPacketSink;
  source: EncodedAudioPacketSource;
  start: number;
  end: number;
  metadata?: EncodedAudioChunkMetadata;
};

async function copyAudioPackets({ sink, source, start, end, metadata }: AudioPacketCopyInput) {
  const startPacket = await sink.getPacket(start);
  if (!startPacket) {
    source.close();
    return;
  }

  let first = true;
  try {
    for await (const packet of sink.packets(startPacket)) {
      if (packet.timestamp >= end) break;
      const duration = Math.max(0, Math.min(packet.duration, end - packet.timestamp));
      const shifted = packet.clone({ timestamp: Math.max(0, packet.timestamp - start), duration });
      await source.add(shifted, first ? metadata : undefined);
      first = false;
    }
  } finally {
    source.close();
  }
}

function normalizeExportError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error("Could not export the video with the new engine.");
}

