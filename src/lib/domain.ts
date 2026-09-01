export type MomentTypeRecord = {
  id: string;
  name: string;
  code: string;
  color: string;
  defaultShortcut: string | null;
  sortOrder: number;
  active: boolean;
  allowedSubmoments?: SubMomentTypeRecord[];
};

export type SubMomentTypeRecord = {
  id: string;
  name: string;
  code: string;
  color: string;
  requiresFieldLocation: boolean;
  requiresGoalLocation: boolean;
  defaultShortcut: string | null;
  sortOrder: number;
  active: boolean;
};

export type SubMomentRecord = {
  id: string;
  momentId: string;
  subMomentTypeId: string;
  timeSeconds: number | null;
  fieldX: number | null;
  fieldY: number | null;
  goalX: number | null;
  goalY: number | null;
  foot: string | null;
  notes: string | null;
  outcome: string | null;
  subMomentType: SubMomentTypeRecord;
};

export type MomentRecord = {
  id: string;
  matchId: string;
  momentTypeId: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  period: string | null;
  notes: string | null;
  outcome: string | null;
  createdByUserId?: string | null;
  liveSessionId?: string | null;
  markedAtSeconds?: number | null;
  leadSeconds?: number | null;
  capturedFromLive?: boolean;
  createdBy?: { id: string; name: string; username: string } | null;
  createdAt: string;
  updatedAt: string;
  momentType: MomentTypeRecord;
  subMoments: SubMomentRecord[];
};

export type LiveSegmentRecord = {
  id: string;
  sequence: number;
  startedAtSeconds: number;
  durationSeconds: number | null;
  mimeType: string;
  fileSize: string | null;
  status: "UPLOADING" | "READY" | "FAILED";
  readyAt: string | null;
  playbackUrl: string | null;
  playbackUrlExpiresAt: string | null;
};

export type LiveSessionRecord = {
  id: string;
  matchId: string;
  status: "PREPARING" | "LIVE" | "ENDED" | "FAILED";
  sourceType: "BROWSER_CAMERA" | "EXTERNAL_ENCODER";
  provider: string;
  playbackUrl: string | null;
  recordingStartedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  lastSegmentAt: string | null;
  startedBy: { id: string; name: string; username: string };
  segments: LiveSegmentRecord[];
};

export type PlaylistRecord = {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  isDefault: boolean;
  visibility: "PERSONAL" | "WORKSPACE";
  user: { id: string; name: string; username: string };
  items: Array<{
    id: string;
    note: string | null;
    sortOrder: number;
    moment: MomentRecord & { match: { id: string; title: string } };
  }>;
};

export type VideoRecord = {
  id: string;
  matchId: string;
  fileName: string;
  fileSize: number;
  durationSeconds: number;
  mimeType: string;
  storageStatus: "LOCAL" | "UPLOADING" | "READY" | "FAILED";
  uploadedAt?: string | null;
};

export type MatchSummary = {
  id: string;
  title: string;
  opponentName: string;
  competition: string | null;
  season: string | null;
  roundName: string | null;
  matchDate: string | null;
  seasonId?: string | null;
  opponentClubId?: string | null;
  competitionId?: string | null;
  video?: VideoRecord | null;
  momentCount: number;
  liveStatus?: "PREPARING" | "LIVE" | "ENDED" | "FAILED" | null;
};

export type MatchDetail = MatchSummary & {
  venue: string | null;
  notes: string | null;
  firstHalfStartSeconds: number | null;
  firstHalfEndSeconds: number | null;
  secondHalfStartSeconds: number | null;
  secondHalfEndSeconds: number | null;
  firstHalfAttackDirection: string;
  secondHalfAttackDirection: string;
  video: VideoRecord | null;
  moments: MomentRecord[];
};

export type SettingsPayload = {
  momentTypes: MomentTypeRecord[];
  subMomentTypes: SubMomentTypeRecord[];
};

export type AccountPayload = {
  id: string;
  name: string;
  username: string;
  teamName: string | null;
  needsOnboarding: boolean;
  managementAccess: { configured: boolean; unlocked: boolean };
};

export type MaintenanceRecord = {
  id: string;
  name: string;
  shortName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  seasonId?: string | null;
  clubIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type MapPoint = {
  id: string;
  matchId: string;
  matchTitle: string;
  momentId: string;
  momentTypeId: string;
  momentTypeName: string;
  momentStartTimeSeconds: number;
  momentEndTimeSeconds: number;
  subMomentTypeId: string;
  subMomentTypeName: string;
  color: string;
  timeSeconds: number | null;
  fieldX: number | null;
  fieldY: number | null;
  goalX: number | null;
  goalY: number | null;
  outcome: string | null;
  period: "first_half" | "second_half" | null;
  attackDirection: "left_to_right" | "right_to_left" | null;
};
