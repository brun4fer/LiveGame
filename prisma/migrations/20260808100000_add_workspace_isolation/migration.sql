CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Season" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Club" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Competition" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Match" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "MomentType" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "SubMomentType" ADD COLUMN "workspaceId" TEXT;

INSERT INTO "Workspace" ("id", "name", "updatedAt") VALUES ('workspace_feirense', 'Feirense', CURRENT_TIMESTAMP);

UPDATE "User" SET "workspaceId" = 'workspace_feirense' WHERE "username" = 'paulo';
UPDATE "Season" SET "workspaceId" = 'workspace_feirense';
UPDATE "Club" SET "workspaceId" = 'workspace_feirense';
UPDATE "Competition" SET "workspaceId" = 'workspace_feirense';
UPDATE "Match" SET "workspaceId" = 'workspace_feirense';
UPDATE "MomentType" SET "workspaceId" = 'workspace_feirense';
UPDATE "SubMomentType" SET "workspaceId" = 'workspace_feirense';

ALTER TABLE "Season" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Club" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Competition" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Match" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "MomentType" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "SubMomentType" ALTER COLUMN "workspaceId" SET NOT NULL;

DROP INDEX IF EXISTS "Season_name_key";
DROP INDEX IF EXISTS "Club_name_key";
DROP INDEX IF EXISTS "Competition_seasonId_name_key";
DROP INDEX IF EXISTS "MomentType_code_key";
DROP INDEX IF EXISTS "SubMomentType_code_key";

CREATE INDEX "User_workspaceId_idx" ON "User"("workspaceId");
CREATE INDEX "Season_workspaceId_idx" ON "Season"("workspaceId");
CREATE UNIQUE INDEX "Season_workspaceId_name_key" ON "Season"("workspaceId", "name");
CREATE INDEX "Club_workspaceId_idx" ON "Club"("workspaceId");
CREATE UNIQUE INDEX "Club_workspaceId_name_key" ON "Club"("workspaceId", "name");
CREATE INDEX "Competition_workspaceId_idx" ON "Competition"("workspaceId");
CREATE UNIQUE INDEX "Competition_workspaceId_seasonId_name_key" ON "Competition"("workspaceId", "seasonId", "name");
CREATE INDEX "Match_workspaceId_idx" ON "Match"("workspaceId");
CREATE INDEX "MomentType_workspaceId_idx" ON "MomentType"("workspaceId");
CREATE UNIQUE INDEX "MomentType_workspaceId_code_key" ON "MomentType"("workspaceId", "code");
CREATE INDEX "SubMomentType_workspaceId_idx" ON "SubMomentType"("workspaceId");
CREATE UNIQUE INDEX "SubMomentType_workspaceId_code_key" ON "SubMomentType"("workspaceId", "code");

ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Season" ADD CONSTRAINT "Season_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Club" ADD CONSTRAINT "Club_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MomentType" ADD CONSTRAINT "MomentType_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubMomentType" ADD CONSTRAINT "SubMomentType_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

