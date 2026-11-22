import { handleApiError } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";
import { serializeMediaAsset } from "@/lib/media-library";
import { mediaPrisma } from "@/lib/media-prisma";
import { ensureMediaWorkspace } from "@/lib/media-workspace";

export async function GET() {
  try {
    const account = await requireWorkspace();
    const { appId, mediaWorkspace } = await ensureMediaWorkspace(account);
    const assets = await mediaPrisma.mediaAsset.findMany({
      where: { mediaWorkspaceId: mediaWorkspace.id, createdByAppId: appId, storageStatus: "READY" },
      orderBy: { uploadedAt: "desc" },
      take: 200,
    });
    return Response.json({ assets: assets.map(serializeMediaAsset) });
  } catch (error) {
    return handleApiError(error);
  }
}

