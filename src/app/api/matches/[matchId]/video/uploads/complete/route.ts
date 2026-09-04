import { handleApiError } from "@/lib/api";
import { requireManagementWorkspace } from "@/lib/auth";
import { mediaPrisma } from "@/lib/media-prisma";
import { completeMediaMultipartUpload, headMediaObject } from "@/lib/media-r2";
import { ensureMediaWorkspace } from "@/lib/media-workspace";
import { prisma } from "@/lib/prisma";
import { completeMultipartUpload } from "@/lib/r2";
import { serializeVideo } from "@/lib/video";
import { legacyVideoUploadPartSize, videoUploadPartSize } from "@/lib/video-upload";

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const account = await requireManagementWorkspace();
    const { workspace } = account;
    const { mediaWorkspace } = await ensureMediaWorkspace(account);
    const { matchId } = await context.params;
    const body = await request.json();
    const parts = Array.isArray(body.parts)
      ? body.parts.map((part: { partNumber?: unknown; etag?: unknown }) => ({
          partNumber: Number(part.partNumber),
          etag: typeof part.etag === "string" ? part.etag : "",
        }))
      : [];
    const video = await prisma.video.findFirst({ where: { matchId, match: { workspaceId: workspace.id } } });
    if (!video || video.storageStatus !== "UPLOADING") {
      return Response.json({ error: "The multipart upload is no longer active." }, { status: 400 });
    }
    const fileSize = Number(video.fileSize);
    const requestedPartSize = Number(body.partSize);
    const allowedPartSizes = [...new Set([videoUploadPartSize(fileSize), legacyVideoUploadPartSize(fileSize)])];
    const partSize = allowedPartSizes.find((candidate) =>
      (!Number.isFinite(requestedPartSize) || requestedPartSize <= 0 || candidate === requestedPartSize)
      && Math.ceil(fileSize / candidate) === parts.length
    );
    const expectedParts = partSize ? Math.ceil(fileSize / partSize) : 0;
    const unique = new Set(parts.map((part: { partNumber: number }) => part.partNumber));
    if (parts.length !== expectedParts || unique.size !== expectedParts || parts.some((part: { partNumber: number; etag: string }) => !Number.isInteger(part.partNumber) || part.partNumber < 1 || part.partNumber > expectedParts || !part.etag)) {
      return Response.json({ error: "The uploaded video is missing one or more parts." }, { status: 400 });
    }
    if (video.mediaAssetId) {
      const asset = await mediaPrisma.mediaAsset.findFirst({ where: { id: video.mediaAssetId, mediaWorkspaceId: mediaWorkspace.id, storageStatus: "UPLOADING" } });
      if (!asset?.uploadId || asset.uploadId !== body.uploadId) return Response.json({ error: "The shared multipart upload is no longer active." }, { status: 400 });
      const etag = await completeMediaMultipartUpload(asset.storageKey, asset.uploadId, parts);
      const head = await headMediaObject(asset.storageKey);
      if (head.contentLength !== Number(video.fileSize)) throw new Error("The completed cloud video size does not match the selected file.");
      const uploadedAt = new Date();
      await mediaPrisma.mediaAsset.update({ where: { id: asset.id }, data: { storageStatus: "READY", uploadId: null, etag: etag || head.etag, uploadedAt } });
      const saved = await prisma.video.update({ where: { id: video.id }, data: { storageStatus: "READY", etag: etag || head.etag, uploadedAt } });
      return Response.json({ video: serializeVideo(saved) });
    }
    if (!video.storageKey || video.uploadId !== body.uploadId) return Response.json({ error: "The multipart upload is no longer active." }, { status: 400 });
    const etag = await completeMultipartUpload(video.storageKey, body.uploadId, parts);
    const saved = await prisma.video.update({
      where: { id: video.id },
      data: { storageStatus: "READY", uploadId: null, etag, uploadedAt: new Date() },
    });
    return Response.json({ video: serializeVideo(saved) });
  } catch (error) { return handleApiError(error); }
}
