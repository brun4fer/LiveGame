CREATE TABLE "WorkspacePresence" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkspacePresence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspacePresence_workspaceId_clientId_key" ON "WorkspacePresence"("workspaceId", "clientId");
CREATE INDEX "WorkspacePresence_workspaceId_lastSeenAt_idx" ON "WorkspacePresence"("workspaceId", "lastSeenAt");
CREATE INDEX "WorkspacePresence_userId_idx" ON "WorkspacePresence"("userId");

ALTER TABLE "WorkspacePresence"
ADD CONSTRAINT "WorkspacePresence_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspacePresence"
ADD CONSTRAINT "WorkspacePresence_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

