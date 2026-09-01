ALTER TABLE "Video" ADD COLUMN "mediaAssetId" TEXT;

CREATE INDEX "Video_mediaAssetId_idx" ON "Video"("mediaAssetId");

