-- Live recording, collaborative workspaces and personal review playlists.
CREATE TYPE "LiveSessionStatus" AS ENUM ('PREPARING', 'LIVE', 'ENDED', 'FAILED');
CREATE TYPE "LiveSourceType" AS ENUM ('BROWSER_CAMERA', 'EXTERNAL_ENCODER');
CREATE TYPE "RecordingSegmentStatus" AS ENUM ('UPLOADING', 'READY', 'FAILED');
CREATE TYPE "PlaylistVisibility" AS ENUM ('PERSONAL', 'WORKSPACE');

CREATE TABLE "WorkspaceInvite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'analyst',
    "createdByUserId" TEXT NOT NULL,
    "claimedByUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "startedByUserId" TEXT NOT NULL,
    "status" "LiveSessionStatus" NOT NULL DEFAULT 'PREPARING',
    "sourceType" "LiveSourceType" NOT NULL DEFAULT 'BROWSER_CAMERA',
    "provider" TEXT NOT NULL DEFAULT 'segment-dvr',
    "providerSessionId" TEXT,
    "playbackUrl" TEXT,
    "recordingStartedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastSegmentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecordingSegment" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startedAtSeconds" DOUBLE PRECISION NOT NULL,
    "durationSeconds" DOUBLE PRECISION,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" BIGINT,
    "status" "RecordingSegmentStatus" NOT NULL DEFAULT 'UPLOADING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    CONSTRAINT "RecordingSegment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "PlaylistVisibility" NOT NULL DEFAULT 'PERSONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlaylistItem" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaylistItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkspacePresence"
  ADD COLUMN "liveSessionId" TEXT,
  ADD COLUMN "playbackPositionSeconds" DOUBLE PRECISION,
  ADD COLUMN "atLiveEdge" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Moment"
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "liveSessionId" TEXT,
  ADD COLUMN "markedAtSeconds" DOUBLE PRECISION,
  ADD COLUMN "leadSeconds" DOUBLE PRECISION DEFAULT 20,
  ADD COLUMN "capturedFromLive" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "WorkspaceInvite_codeHash_key" ON "WorkspaceInvite"("codeHash");
CREATE INDEX "WorkspaceInvite_workspaceId_expiresAt_idx" ON "WorkspaceInvite"("workspaceId", "expiresAt");
CREATE INDEX "LiveSession_matchId_status_idx" ON "LiveSession"("matchId", "status");
CREATE INDEX "LiveSession_startedByUserId_idx" ON "LiveSession"("startedByUserId");
CREATE UNIQUE INDEX "RecordingSegment_storageKey_key" ON "RecordingSegment"("storageKey");
CREATE UNIQUE INDEX "RecordingSegment_liveSessionId_sequence_key" ON "RecordingSegment"("liveSessionId", "sequence");
CREATE INDEX "RecordingSegment_liveSessionId_status_sequence_idx" ON "RecordingSegment"("liveSessionId", "status", "sequence");
CREATE INDEX "Playlist_workspaceId_idx" ON "Playlist"("workspaceId");
CREATE INDEX "Playlist_userId_idx" ON "Playlist"("userId");
CREATE UNIQUE INDEX "Playlist_userId_name_key" ON "Playlist"("userId", "name");
CREATE UNIQUE INDEX "PlaylistItem_playlistId_momentId_key" ON "PlaylistItem"("playlistId", "momentId");
CREATE INDEX "PlaylistItem_momentId_idx" ON "PlaylistItem"("momentId");
CREATE INDEX "WorkspacePresence_liveSessionId_lastSeenAt_idx" ON "WorkspacePresence"("liveSessionId", "lastSeenAt");
CREATE INDEX "Moment_createdByUserId_idx" ON "Moment"("createdByUserId");
CREATE INDEX "Moment_liveSessionId_markedAtSeconds_idx" ON "Moment"("liveSessionId", "markedAtSeconds");

ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecordingSegment" ADD CONSTRAINT "RecordingSegment_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspacePresence" ADD CONSTRAINT "WorkspacePresence_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
