import { LiveSessionStatus, LiveSourceType, RecordingSegmentStatus } from "@prisma/client";

import { requireWorkspace } from "@/lib/auth";
import { cloudflareStreamConfigured, createRealtimeLiveInput, getRealtimeLiveInput } from "@/lib/cloudflare-stream";
import { getMatchPeriodAtTime } from "@/lib/match-periods";
import { prisma } from "@/lib/prisma";
import { createObjectUploadUrl, createPlaybackUrl } from "@/lib/r2";

export const DEFAULT_LIVE_LEAD_SECONDS = 20;
const MAX_SEGMENT_SECONDS = 15;

export function liveMomentWindow(markedAtSeconds: number, leadSeconds = DEFAULT_LIVE_LEAD_SECONDS, minimumStartSeconds = 0) {
  if (!Number.isFinite(markedAtSeconds) || markedAtSeconds <= 0) throw new Error("The live playhead is not ready yet.");
  if (!Number.isFinite(leadSeconds) || leadSeconds < 1 || leadSeconds > 120) throw new Error("The lead time must be between 1 and 120 seconds.");
  if (!Number.isFinite(minimumStartSeconds) || minimumStartSeconds < 0 || minimumStartSeconds > markedAtSeconds) throw new Error("The recording part start time is invalid.");
  const startTimeSeconds = Math.max(minimumStartSeconds, markedAtSeconds - leadSeconds);
  return { startTimeSeconds, endTimeSeconds: markedAtSeconds, durationSeconds: markedAtSeconds - startTimeSeconds };
}

const liveSessionInclude = {
  startedBy: { select: { id: true, name: true, username: true } },
  segments: { orderBy: { sequence: "asc" as const } },
};

function serializeSegment(segment: { id: string; sequence: number; startedAtSeconds: number; durationSeconds: number | null; storageKey: string; mimeType: string; fileSize: bigint | null; status: RecordingSegmentStatus; readyAt: Date | null }) {
  const playback = segment.status === RecordingSegmentStatus.READY ? createPlaybackUrl(segment.storageKey) : null;
  return {
    id: segment.id,
    sequence: segment.sequence,
    startedAtSeconds: segment.startedAtSeconds,
    durationSeconds: segment.durationSeconds,
    mimeType: segment.mimeType,
    fileSize: segment.fileSize?.toString() ?? null,
    status: segment.status,
    readyAt: segment.readyAt?.toISOString() ?? null,
    playbackUrl: playback?.url ?? null,
    playbackUrlExpiresAt: playback?.expiresAt ?? null,
  };
}

function serializeLiveSession(session: Awaited<ReturnType<typeof prisma.liveSession.findFirstOrThrow>> & Record<string, unknown>) {
  const segments = (session.segments as Array<Parameters<typeof serializeSegment>[0]> | undefined) ?? [];
  return {
    id: session.id,
    matchId: session.matchId,
    status: session.status,
    sourceType: session.sourceType,
    provider: session.provider,
    playbackUrl: session.playbackUrl,
    recordingStartedAt: session.recordingStartedAt instanceof Date ? session.recordingStartedAt.toISOString() : session.recordingStartedAt,
    startedAt: session.startedAt instanceof Date ? session.startedAt.toISOString() : session.startedAt,
    endedAt: session.endedAt instanceof Date ? session.endedAt.toISOString() : session.endedAt,
    lastSegmentAt: session.lastSegmentAt instanceof Date ? session.lastSegmentAt.toISOString() : session.lastSegmentAt,
    startedBy: session.startedBy,
    segments: segments.map(serializeSegment),
  };
}

export async function getCurrentLiveSession(matchId: string, afterSequence?: number) {
  const { workspace } = await requireWorkspace();
  await prisma.match.findFirstOrThrow({ where: { id: matchId, workspaceId: workspace.id }, select: { id: true } });
  const session = await prisma.liveSession.findFirst({
    where: { matchId },
    include: {
      ...liveSessionInclude,
      segments: {
        where: { status: RecordingSegmentStatus.READY, ...(afterSequence === undefined ? {} : { sequence: { gt: afterSequence } }) },
        orderBy: { sequence: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return session ? serializeLiveSession(session as never) : null;
}

export async function getLiveSession(liveSessionId: string) {
  const { workspace } = await requireWorkspace();
  const session = await prisma.liveSession.findFirstOrThrow({
    where: { id: liveSessionId, match: { workspaceId: workspace.id } },
    include: { ...liveSessionInclude, segments: { where: { status: RecordingSegmentStatus.READY }, orderBy: { sequence: "asc" } } },
  });
  return serializeLiveSession(session as never);
}

export async function startLiveSession(matchId: string, input: Record<string, unknown>) {
  const { user, workspace } = await requireWorkspace();
  return startLiveSessionForIdentity(matchId, input, { userId: user.id, workspaceId: workspace.id });
}

async function startLiveSessionForIdentity(matchId: string, input: Record<string, unknown>, identity: { userId: string; workspaceId: string }) {
  const { userId, workspaceId } = identity;
  const match = await prisma.match.findFirstOrThrow({ where: { id: matchId, workspaceId }, select: { id: true, title: true } });
  const existing = await prisma.liveSession.findFirst({ where: { matchId, status: { in: [LiveSessionStatus.PREPARING, LiveSessionStatus.LIVE] } }, include: liveSessionInclude });
  if (existing) {
    let active = existing;
    if (input.enableRealtime === true && cloudflareStreamConfigured() && (existing.provider !== "cloudflare-stream" || !existing.providerSessionId)) {
      const realtime = await createRealtimeLiveInput({ name: match.title, matchId: match.id, workspaceId });
      if (realtime) {
        active = await prisma.liveSession.update({
          where: { id: existing.id },
          data: { provider: "cloudflare-stream", providerSessionId: realtime.id, playbackUrl: realtime.playbackUrl },
          include: liveSessionInclude,
        });
        return { ...serializeLiveSession(active as never), publishUrl: realtime.publishUrl, realtimeAvailable: true, realtimeError: null };
      }
    }
    const serialized = serializeLiveSession(active as never);
    if (!cloudflareStreamConfigured() || active.provider !== "cloudflare-stream" || !active.providerSessionId) return serialized;
    try {
      const realtime = await getRealtimeLiveInput(active.providerSessionId);
      return { ...serialized, publishUrl: realtime?.publishUrl ?? null, realtimeAvailable: Boolean(realtime) };
    } catch (error) {
      return { ...serialized, publishUrl: null, realtimeAvailable: false, realtimeError: error instanceof Error ? error.message : "Realtime video could not be resumed." };
    }
  }

  const sourceType = input.sourceType === "EXTERNAL_ENCODER" ? LiveSourceType.EXTERNAL_ENCODER : LiveSourceType.BROWSER_CAMERA;
  const createdAt = new Date();
  let realtime: Awaited<ReturnType<typeof createRealtimeLiveInput>> = null;
  let realtimeError: string | null = null;
  try {
    if (input.enableRealtime === true && cloudflareStreamConfigured()) realtime = await createRealtimeLiveInput({ name: match.title, matchId: match.id, workspaceId });
  } catch (error) {
    realtimeError = error instanceof Error ? error.message : "Cloudflare Stream could not be started.";
  }
  const created = await prisma.liveSession.create({
    data: {
      matchId,
      startedByUserId: userId,
      sourceType,
      status: LiveSessionStatus.LIVE,
      startedAt: createdAt,
      recordingStartedAt: createdAt,
      provider: realtime ? "cloudflare-stream" : "segment-dvr",
      providerSessionId: realtime?.id ?? null,
      playbackUrl: realtime?.playbackUrl ?? (typeof input.playbackUrl === "string" && input.playbackUrl.trim() ? input.playbackUrl.trim() : null),
    },
    include: liveSessionInclude,
  });
  return {
    ...serializeLiveSession(created as never),
    publishUrl: realtime?.publishUrl ?? null,
    realtimeAvailable: Boolean(realtime),
    realtimeError,
  };
}

export async function startPairedCameraSession(matchId: string, workspaceId: string, userId: string) {
  if (!cloudflareStreamConfigured()) throw new Error("Cloudflare Stream is not configured for wireless camera transmission.");
  const session = await startLiveSessionForIdentity(matchId, { sourceType: "BROWSER_CAMERA", enableRealtime: true }, { workspaceId, userId });
  if (!("publishUrl" in session) || !session.publishUrl) throw new Error("The wireless live input could not be prepared. Generate a new pairing link and try again.");
  return session;
}

export async function stopLiveSession(matchId: string) {
  const { workspace } = await requireWorkspace();
  const session = await prisma.liveSession.findFirst({ where: { matchId, match: { workspaceId: workspace.id }, status: { in: [LiveSessionStatus.PREPARING, LiveSessionStatus.LIVE] } } });
  if (!session) throw new Error("There is no active live session for this match.");
  const saved = await prisma.liveSession.update({ where: { id: session.id }, data: { status: LiveSessionStatus.ENDED, endedAt: new Date() }, include: liveSessionInclude });
  return serializeLiveSession(saved as never);
}

export async function prepareRecordingSegment(liveSessionId: string, input: Record<string, unknown>) {
  const { workspace } = await requireWorkspace();
  return prepareRecordingSegmentForWorkspace(workspace.id, undefined, liveSessionId, input);
}

async function prepareRecordingSegmentForWorkspace(workspaceId: string, matchId: string | undefined, liveSessionId: string, input: Record<string, unknown>) {
  const sequence = Number(input.sequence);
  const startedAtSeconds = Number(input.startedAtSeconds);
  const mimeType = String(input.mimeType || "video/webm").split(";", 1)[0].trim().toLowerCase();
  if (!Number.isInteger(sequence) || sequence < 0) throw new Error("Invalid recording segment sequence.");
  if (!Number.isFinite(startedAtSeconds) || startedAtSeconds < 0) throw new Error("Invalid recording segment time.");
  if (!mimeType.startsWith("video/")) throw new Error("Invalid recording segment format.");
  const session = await prisma.liveSession.findFirstOrThrow({ where: { id: liveSessionId, ...(matchId ? { matchId } : {}), match: { workspaceId }, status: LiveSessionStatus.LIVE } });
  const storageKey = `workspaces/${workspaceId}/live/${session.id}/segments/${String(sequence).padStart(8, "0")}`;
  const segment = await prisma.recordingSegment.upsert({
    where: { liveSessionId_sequence: { liveSessionId, sequence } },
    create: { liveSessionId, sequence, startedAtSeconds, storageKey, mimeType },
    update: { startedAtSeconds, mimeType, status: RecordingSegmentStatus.UPLOADING, durationSeconds: null, fileSize: null, readyAt: null },
  });
  return { id: segment.id, uploadUrl: createObjectUploadUrl(storageKey), storageKey, sequence };
}

export function preparePairedRecordingSegment(workspaceId: string, matchId: string, liveSessionId: string, input: Record<string, unknown>) {
  return prepareRecordingSegmentForWorkspace(workspaceId, matchId, liveSessionId, input);
}

export async function completeRecordingSegment(liveSessionId: string, segmentId: string, input: Record<string, unknown>) {
  const { workspace } = await requireWorkspace();
  return completeRecordingSegmentForWorkspace(workspace.id, undefined, liveSessionId, segmentId, input);
}

async function completeRecordingSegmentForWorkspace(workspaceId: string, matchId: string | undefined, liveSessionId: string, segmentId: string, input: Record<string, unknown>) {
  const durationSeconds = Number(input.durationSeconds);
  const fileSize = Number(input.fileSize);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_SEGMENT_SECONDS) throw new Error("Invalid recording segment duration.");
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) throw new Error("Invalid recording segment size.");
  const segment = await prisma.recordingSegment.findFirstOrThrow({ where: { id: segmentId, liveSessionId, liveSession: { ...(matchId ? { matchId } : {}), match: { workspaceId }, status: { in: [LiveSessionStatus.LIVE, LiveSessionStatus.ENDED] } } } });
  const now = new Date();
  const saved = await prisma.$transaction(async (tx) => {
    const row = await tx.recordingSegment.update({ where: { id: segment.id }, data: { durationSeconds, fileSize: BigInt(fileSize), status: RecordingSegmentStatus.READY, readyAt: now } });
    await tx.liveSession.update({ where: { id: liveSessionId }, data: { lastSegmentAt: now } });
    return row;
  });
  return serializeSegment(saved);
}

export function completePairedRecordingSegment(workspaceId: string, matchId: string, liveSessionId: string, segmentId: string, input: Record<string, unknown>) {
  return completeRecordingSegmentForWorkspace(workspaceId, matchId, liveSessionId, segmentId, input);
}

export async function failRecordingSegment(liveSessionId: string, segmentId: string) {
  const { workspace } = await requireWorkspace();
  return failRecordingSegmentForWorkspace(workspace.id, undefined, liveSessionId, segmentId);
}

async function failRecordingSegmentForWorkspace(workspaceId: string, matchId: string | undefined, liveSessionId: string, segmentId: string) {
  const segment = await prisma.recordingSegment.findFirstOrThrow({ where: { id: segmentId, liveSessionId, liveSession: { ...(matchId ? { matchId } : {}), match: { workspaceId } } } });
  await prisma.recordingSegment.update({ where: { id: segment.id }, data: { status: RecordingSegmentStatus.FAILED } });
}

export function failPairedRecordingSegment(workspaceId: string, matchId: string, liveSessionId: string, segmentId: string) {
  return failRecordingSegmentForWorkspace(workspaceId, matchId, liveSessionId, segmentId);
}

export async function markLiveMoment(matchId: string, input: Record<string, unknown>) {
  const { user, workspace } = await requireWorkspace();
  const markedAtSeconds = Number(input.markedAtSeconds);
  const leadSeconds = input.leadSeconds === undefined ? DEFAULT_LIVE_LEAD_SECONDS : Number(input.leadSeconds);
  const partStartedAtSeconds = input.partStartedAtSeconds === undefined ? 0 : Number(input.partStartedAtSeconds);
  const window = liveMomentWindow(markedAtSeconds, leadSeconds, partStartedAtSeconds);
  const momentTypeId = String(input.momentTypeId || "");
  const [match, type, session] = await Promise.all([
    prisma.match.findFirstOrThrow({ where: { id: matchId, workspaceId: workspace.id } }),
    prisma.momentType.findFirstOrThrow({ where: { id: momentTypeId, workspaceId: workspace.id, active: true } }),
    prisma.liveSession.findFirstOrThrow({ where: { id: String(input.liveSessionId || ""), matchId, status: LiveSessionStatus.LIVE } }),
  ]);
  const saved = await prisma.$transaction(async (tx) => {
    const moment = await tx.moment.create({
      data: {
        matchId,
        momentTypeId: type.id,
        startTimeSeconds: window.startTimeSeconds,
        endTimeSeconds: window.endTimeSeconds,
        durationSeconds: window.durationSeconds,
        period: getMatchPeriodAtTime(match, window.startTimeSeconds),
        notes: typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null,
        createdByUserId: user.id,
        liveSessionId: session.id,
        markedAtSeconds,
        leadSeconds,
        capturedFromLive: true,
      },
      include: { momentType: true, subMoments: { include: { subMomentType: true } }, createdBy: { select: { id: true, name: true, username: true } } },
    });
    const playlist = await tx.playlist.findFirst({ where: { userId: user.id, workspaceId: workspace.id, isDefault: true } });
    if (playlist) await tx.playlistItem.create({ data: { playlistId: playlist.id, momentId: moment.id, sortOrder: await tx.playlistItem.count({ where: { playlistId: playlist.id } }) } });
    return moment;
  });
  return saved;
}
