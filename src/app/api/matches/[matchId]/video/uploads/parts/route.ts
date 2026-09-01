import { handleApiError } from "@/lib/api";
import { requireManagementWorkspace } from "@/lib/auth";
import { mediaPrisma } from "@/lib/media-prisma";
import { presignMediaMultipartParts } from "@/lib/media-r2";
import { ensureMediaWorkspace } from "@/lib/media-workspace";
import { prisma } from "@/lib/prisma";
import { presignMultipartParts } from "@/lib/r2";

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const account = await requireManagementWorkspace();
    const { workspace } = account;
    const { mediaWorkspace } = await ensureMediaWorkspace(account);
    const { matchId } = await context.params;
    const body = await request.json();
    const partNumbers: number[] = Array.isArray(body.partNumbers) ? [...new Set<number>(body.partNumbers.map(Number))] : [];
    if (!body.uploadId || !partNumbers.length || partNumbers.length > 500 || partNumbers.some((part) => !Number.isInteger(part) || part < 1 || part > 10_000)) {
      return Response.json({ error: "Invalid multipart upload request." }, { status: 400 });
    }
    const video = await prisma.video.findFirst({ where: { matchId, match: { workspaceId: workspace.id } } });
    if (!video || video.storageStatus !== "UPLOADING") {
      return Response.json({ error: "The multipart upload is no longer active." }, { status: 400 });
    }
    if (video.mediaAssetId) {
      const asset = await mediaPrisma.mediaAsset.findFirst({ where: { id: video.mediaAssetId, mediaWorkspaceId: mediaWorkspace.id, storageStatus: "UPLOADING" } });
      if (!asset?.uploadId || asset.uploadId !== body.uploadId) return Response.json({ error: "The shared multipart upload is no longer active." }, { status: 400 });
      return Response.json({ parts: presignMediaMultipartParts(asset.storageKey, asset.uploadId, partNumbers) });
    }
    if (!video.storageKey || video.uploadId !== body.uploadId) return Response.json({ error: "The multipart upload is no longer active." }, { status: 400 });
    return Response.json({ parts: presignMultipartParts(video.storageKey, body.uploadId, partNumbers) });
  } catch (error) { return handleApiError(error); }
}

