import { handleApiError } from "@/lib/api";
import { requireManagementWorkspace } from "@/lib/auth";
import { setMediaReference } from "@/lib/media-library";
import { mediaPrisma } from "@/lib/media-prisma";
import { ensureMediaWorkspace } from "@/lib/media-workspace";
import { prisma } from "@/lib/prisma";
import { abortMultipartUpload } from "@/lib/r2";
import { serializeVideo } from "@/lib/video";

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const account = await requireManagementWorkspace();
    const { workspace } = account;
    const { appId, mediaWorkspace } = await ensureMediaWorkspace(account);
    const { matchId } = await context.params;
    const body = await request.json();
    const mediaAssetId = typeof body.mediaAssetId === "string" ? body.mediaAssetId : "";
    if (!mediaAssetId) return Response.json({ error: "Select a video from the cloud library." }, { status: 400 });

    const [match, asset] = await Promise.all([
      prisma.match.findFirst({ where: { id: matchId, workspaceId: workspace.id }, include: { video: true } }),
      mediaPrisma.mediaAsset.findFirst({ where: { id: mediaAssetId, mediaWorkspaceId: mediaWorkspace.id, storageStatus: "READY" } }),
    ]);
    if (!match) return Response.json({ error: "Invalid match." }, { status: 400 });
    if (!asset) return Response.json({ error: "That cloud video is not available in this workspace." }, { status: 404 });

    if (match.video?.storageKey && match.video.uploadId) {
      await abortMultipartUpload(match.video.storageKey, match.video.uploadId).catch(() => undefined);
    }

    const data = {
      fileName: asset.fileName,
      fileSize: asset.fileSize,
      durationSeconds: asset.durationSeconds,
      mimeType: asset.mimeType,
      lastModified: asset.lastModified,
      storageKey: null,
      storageStatus: "READY" as const,
      uploadId: null,
      etag: asset.etag,
      uploadedAt: asset.uploadedAt,
      mediaAssetId: asset.id,
    };
    const video = await prisma.video.upsert({ where: { matchId }, create: { matchId, ...data }, update: data });
    await setMediaReference({ mediaWorkspaceId: mediaWorkspace.id, mediaAssetId: asset.id, appId, externalVideoId: video.id, externalMatchId: match.id });
    return Response.json({ video: serializeVideo(video) });
  } catch (error) {
    return handleApiError(error);
  }
}

