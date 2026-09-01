import { randomUUID } from "node:crypto";
import { handleApiError } from "@/lib/api";
import { requireManagementWorkspace } from "@/lib/auth";
import { setMediaReference } from "@/lib/media-library";
import { mediaPrisma } from "@/lib/media-prisma";
import { abortMediaMultipartUpload, createMediaMultipartUpload, listMediaMultipartParts } from "@/lib/media-r2";
import { ensureMediaWorkspace } from "@/lib/media-workspace";
import { prisma } from "@/lib/prisma";
import { abortMultipartUpload, listMultipartParts } from "@/lib/r2";
import { serializeVideo } from "@/lib/video";

const MEBIBYTE = 1024 * 1024;
const DEFAULT_PART_SIZE = 64 * MEBIBYTE;
const MAX_FILE_SIZE = 5 * 1024 ** 4 - 5 * 1024 ** 3;

function partSizeFor(fileSize: number) {
  return Math.max(DEFAULT_PART_SIZE, Math.ceil(fileSize / 10_000 / MEBIBYTE) * MEBIBYTE);
}

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  let created: { id: string; key: string; uploadId: string } | null = null;
  try {
    const account = await requireManagementWorkspace();
    const { workspace } = account;
    const { appId, mediaWorkspace } = await ensureMediaWorkspace(account);
    const { matchId } = await context.params;
    const body = await request.json();
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const fileSize = Number(body.fileSize);
    const durationSeconds = Number(body.durationSeconds);
    const mimeType = typeof body.mimeType === "string" && body.mimeType.startsWith("video/") ? body.mimeType : "video/mp4";
    const lastModified = body.lastModified ? new Date(body.lastModified) : null;
    if (!fileName || !Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
      return Response.json({ error: "Invalid video size." }, { status: 400 });
    }
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return Response.json({ error: "Invalid video duration." }, { status: 400 });
    }
    if (lastModified && Number.isNaN(lastModified.getTime())) {
      return Response.json({ error: "Invalid video modification date." }, { status: 400 });
    }

    const match = await prisma.match.findFirst({ where: { id: matchId, workspaceId: workspace.id }, include: { video: true } });
    if (!match) return Response.json({ error: "Invalid match." }, { status: 400 });

    const existing = match.video;
    const sameFile = existing
      && existing.fileName === fileName
      && Number(existing.fileSize) === fileSize
      && existing.lastModified?.getTime() === lastModified?.getTime();
    const partSize = partSizeFor(fileSize);
    if (sameFile && existing.storageStatus === "READY" && (existing.storageKey || existing.mediaAssetId)) {
      return Response.json({ video: serializeVideo(existing), uploadId: null, partSize, completedParts: [], alreadyReady: true });
    }
    if (sameFile && existing?.storageStatus === "UPLOADING" && existing.mediaAssetId) {
      const asset = await mediaPrisma.mediaAsset.findFirst({ where: { id: existing.mediaAssetId, mediaWorkspaceId: mediaWorkspace.id } });
      if (asset?.storageStatus === "UPLOADING" && asset.uploadId) {
        try {
          const completedParts = await listMediaMultipartParts(asset.storageKey, asset.uploadId);
          return Response.json({ video: serializeVideo(existing), uploadId: asset.uploadId, partSize, completedParts, alreadyReady: false });
        } catch {
          await mediaPrisma.mediaAsset.update({ where: { id: asset.id }, data: { storageStatus: "FAILED", uploadId: null } }).catch(() => undefined);
        }
      }
    }
    if (sameFile && existing.storageStatus === "UPLOADING" && existing.storageKey && existing.uploadId) {
      try {
        const completedParts = await listMultipartParts(existing.storageKey, existing.uploadId);
        return Response.json({ video: serializeVideo(existing), uploadId: existing.uploadId, partSize, completedParts, alreadyReady: false });
      } catch {
        // The remote multipart session expired; start a fresh one below.
      }
    }
    if (existing?.storageKey && existing.uploadId) {
      await abortMultipartUpload(existing.storageKey, existing.uploadId).catch(() => undefined);
    }
    if (existing?.mediaAssetId) {
      const pending = await mediaPrisma.mediaAsset.findFirst({ where: { id: existing.mediaAssetId, mediaWorkspaceId: mediaWorkspace.id, storageStatus: "UPLOADING" } });
      if (pending?.uploadId) {
        await abortMediaMultipartUpload(pending.storageKey, pending.uploadId).catch(() => undefined);
        await mediaPrisma.mediaAsset.update({ where: { id: pending.id }, data: { storageStatus: "FAILED", uploadId: null } }).catch(() => undefined);
      }
    }

    const assetId = randomUUID();
    const storageKey = `workspaces/${mediaWorkspace.id}/assets/${assetId}/video`;
    const uploadId = await createMediaMultipartUpload(storageKey, mimeType);
    created = { id: assetId, key: storageKey, uploadId };
    await mediaPrisma.mediaAsset.create({ data: {
      id: assetId,
      mediaWorkspaceId: mediaWorkspace.id,
      createdByAppId: appId,
      fileName,
      fileSize: BigInt(fileSize),
      durationSeconds,
      mimeType,
      lastModified,
      storageKey,
      storageStatus: "UPLOADING",
      uploadId,
    } });
    const data = {
      fileName,
      fileSize: BigInt(fileSize),
      durationSeconds,
      mimeType,
      lastModified,
      storageKey: null,
      storageStatus: "UPLOADING" as const,
      uploadId: null,
      etag: null,
      uploadedAt: null,
      mediaAssetId: assetId,
    };
    const video = await prisma.video.upsert({ where: { matchId }, create: { matchId, ...data }, update: data });
    await setMediaReference({ mediaWorkspaceId: mediaWorkspace.id, mediaAssetId: assetId, appId, externalVideoId: video.id, externalMatchId: match.id });
    return Response.json({ video: serializeVideo(video), uploadId, partSize, completedParts: [], alreadyReady: false }, { status: 201 });
  } catch (error) {
    if (created) {
      await abortMediaMultipartUpload(created.key, created.uploadId).catch(() => undefined);
      await mediaPrisma.mediaAsset.updateMany({ where: { id: created.id }, data: { storageStatus: "FAILED", uploadId: null } }).catch(() => undefined);
    }
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const account = await requireManagementWorkspace();
    const { workspace } = account;
    const { mediaWorkspace } = await ensureMediaWorkspace(account);
    const { matchId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const video = await prisma.video.findFirst({ where: { matchId, match: { workspaceId: workspace.id } } });
    if (!video) return Response.json({ aborted: true });
    if (video.mediaAssetId) {
      const asset = await mediaPrisma.mediaAsset.findFirst({ where: { id: video.mediaAssetId, mediaWorkspaceId: mediaWorkspace.id, storageStatus: "UPLOADING" } });
      if (asset?.uploadId && (!body.uploadId || body.uploadId === asset.uploadId)) {
        await abortMediaMultipartUpload(asset.storageKey, asset.uploadId).catch(() => undefined);
        await mediaPrisma.mediaAsset.update({ where: { id: asset.id }, data: { storageStatus: "FAILED", uploadId: null } });
        await prisma.video.update({ where: { id: video.id }, data: { storageStatus: "FAILED" } });
      }
      return Response.json({ aborted: true });
    }
    if (video.storageKey && video.uploadId && (!body.uploadId || body.uploadId === video.uploadId)) {
      await abortMultipartUpload(video.storageKey, video.uploadId).catch(() => undefined);
      await prisma.video.update({ where: { id: video.id }, data: { storageStatus: "FAILED", uploadId: null } });
    }
    return Response.json({ aborted: true });
  } catch (error) { return handleApiError(error); }
}

