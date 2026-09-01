CREATE TYPE "VideoStorageStatus" AS ENUM ('LOCAL', 'UPLOADING', 'READY', 'FAILED');

ALTER TABLE "Video"
ADD COLUMN "storageKey" TEXT,
ADD COLUMN "storageStatus" "VideoStorageStatus" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN "uploadId" TEXT,
ADD COLUMN "etag" TEXT,
ADD COLUMN "uploadedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Video_storageKey_key" ON "Video"("storageKey");

