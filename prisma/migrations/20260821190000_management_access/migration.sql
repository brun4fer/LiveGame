-- Protect administrative areas with a separate password and invalidate old unlocks when it changes.
ALTER TABLE "Workspace" ADD COLUMN "managementPasswordHash" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "managementPasswordVersion" INTEGER NOT NULL DEFAULT 0;

