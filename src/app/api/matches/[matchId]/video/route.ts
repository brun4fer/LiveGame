import { handleApiError, readJson } from "@/lib/api";
import { requireManagementWorkspace, requireWorkspace } from "@/lib/auth";
import { saveVideo } from "@/lib/data-store";
import { removeMediaReference } from "@/lib/media-library";
import { mediaPrisma } from "@/lib/media-prisma";
import { abortMediaMultipartUpload, createMediaPlaybackUrl } from "@/lib/media-r2";
import { ensureMediaWorkspace } from "@/lib/media-workspace";
import { prisma } from "@/lib/prisma";
import { abortMultipartUpload, createPlaybackUrl, deleteR2Object } from "@/lib/r2";

export async function GET(_: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const { workspace } = await requireWorkspace();
    const { matchId } = await context.params;
    const video = await prisma.video.findFirst({ where: { matchId, match: { workspaceId: workspace.id } } });
    if (!video) return Response.json({ error: "This match does not have a video." }, { status: 404 });
    if (video.storageStatus !== "READY") {
      return Response.json({ error: "The video has not been uploaded to Cloudflare R2 yet." }, { status: 404 });
    }
    if (video.mediaAssetId) {
      const account = await requireWorkspace();
      const { mediaWorkspace } = await ensureMediaWorkspace(account);
      const asset = await mediaPrisma.mediaAsset.findFirst({ where: { id: video.mediaAssetId, mediaWorkspaceId: mediaWorkspace.id, storageStatus: "READY" } });
      if (!asset) return Response.json({ error: "The shared cloud video is no longer available." }, { status: 404 });
      return Response.json(createMediaPlaybackUrl(asset.storageKey));
    }
    if (!video.storageKey) return Response.json({ error: "The video has not been uploaded to Cloudflare R2 yet." }, { status: 404 });
    return Response.json(createPlaybackUrl(video.storageKey));
  } catch (error) { return handleApiError(error); }
}

// Retained for older clients that only register a local file's metadata.
export async function PUT(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try { return Response.json(await saveVideo((await context.params).matchId, await readJson<Record<string, unknown>>(request))); }
  catch (error) { return handleApiError(error); }
}

export async function DELETE(_: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const account = await requireManagementWorkspace();
    const { workspace } = account;
    const { matchId } = await context.params;
    const video = await prisma.video.findFirst({ where: { matchId, match: { workspaceId: workspace.id } } });
    if (!video) return Response.json({ deleted: true });
    if (video.mediaAssetId) {
      const { appId, mediaWorkspace } = await ensureMediaWorkspace(account);
      const asset = await mediaPrisma.mediaAsset.findFirst({ where: { id: video.mediaAssetId, mediaWorkspaceId: mediaWorkspace.id } });
      if (asset?.storageStatus === "UPLOADING" && asset.uploadId) {
        await abortMediaMultipartUpload(asset.storageKey, asset.uploadId).catch(() => undefined);
        await mediaPrisma.mediaAsset.update({ where: { id: asset.id }, data: { storageStatus: "FAILED", uploadId: null } });
      }
      await removeMediaReference(appId, video.id);
    } else {
      if (video.storageKey && video.uploadId) await abortMultipartUpload(video.storageKey, video.uploadId).catch(() => undefined);
      if (video.storageKey) await deleteR2Object(video.storageKey);
    }
    await prisma.video.delete({ where: { id: video.id } });
    return Response.json({ deleted: true });
  } catch (error) { return handleApiError(error); }
}

