import type { MediaAsset } from "@/generated/media-client";
import { mediaPrisma } from "@/lib/media-prisma";

export function serializeMediaAsset(asset: MediaAsset) {
  return {
    id: asset.id,
    fileName: asset.fileName,
    fileSize: asset.fileSize.toString(),
    durationSeconds: asset.durationSeconds,
    mimeType: asset.mimeType,
    storageStatus: asset.storageStatus,
    etag: asset.etag,
    uploadedAt: asset.uploadedAt?.toISOString() ?? null,
    createdAt: asset.createdAt.toISOString(),
  };
}

export async function setMediaReference(input: {
  mediaWorkspaceId: string;
  mediaAssetId: string;
  appId: string;
  externalVideoId: string;
  externalMatchId: string;
}) {
  return mediaPrisma.mediaReference.upsert({
    where: { appId_externalVideoId: { appId: input.appId, externalVideoId: input.externalVideoId } },
    create: input,
    update: {
      mediaWorkspaceId: input.mediaWorkspaceId,
      mediaAssetId: input.mediaAssetId,
      externalMatchId: input.externalMatchId,
    },
  });
}

export async function removeMediaReference(appId: string, externalVideoId: string) {
  await mediaPrisma.mediaReference.deleteMany({ where: { appId, externalVideoId } });
}

