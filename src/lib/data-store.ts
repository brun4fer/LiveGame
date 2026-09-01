import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireManagementWorkspace, requireWorkspace } from "@/lib/auth";
import { getAttackDirectionAtTime, getMatchPeriodAtTime } from "@/lib/match-periods";
import { removeMediaReference } from "@/lib/media-library";
import { mediaPrisma } from "@/lib/media-prisma";
import { abortMediaMultipartUpload } from "@/lib/media-r2";
import { ensureMediaWorkspace } from "@/lib/media-workspace";
import { abortMultipartUpload, deleteR2Object } from "@/lib/r2";
import { serializeVideo } from "@/lib/video";

const matchInclude = {
  video: true,
  moments: {
    include: {
      momentType: true,
      createdBy: { select: { id: true, name: true, username: true } },
      subMoments: { include: { subMomentType: true }, orderBy: { timeSeconds: "asc" as const } }
    },
    orderBy: { startTimeSeconds: "asc" as const }
  }
};

function serializeMatch(match: Awaited<ReturnType<typeof prisma.match.findFirstOrThrow>> & Record<string, unknown>) {
  const video = match.video as ({ fileSize: bigint; storageKey?: string | null; uploadId?: string | null } & Record<string, unknown>) | null | undefined;
  const moments = (match.moments as unknown[] | undefined) ?? [];
  return {
    ...match,
    matchDate: match.matchDate instanceof Date ? match.matchDate.toISOString() : match.matchDate,
    video: video ? serializeVideo(video) : null,
    momentCount: moments.length,
    moments
  };
}

export async function listMatches() {
  const { workspace } = await requireWorkspace();
  const rows = await prisma.match.findMany({
    where: { workspaceId: workspace.id },
    include: { video: true, liveSessions: { select: { status: true }, orderBy: { createdAt: "desc" }, take: 1 }, _count: { select: { moments: true } } },
    orderBy: [{ matchDate: "desc" }, { createdAt: "desc" }]
  });
  return rows.map((match) => ({
    id: match.id,
    title: match.title,
    opponentName: match.opponentName,
    competition: match.competition,
    season: match.season,
    roundName: match.roundName,
    matchDate: match.matchDate?.toISOString() ?? null,
    seasonId: match.seasonId,
    opponentClubId: match.opponentClubId,
    competitionId: match.competitionId,
    video: match.video ? serializeVideo(match.video) : null,
    momentCount: match._count.moments,
    liveStatus: match.liveSessions[0]?.status ?? null
  }));
}

export async function getMatch(matchId: string) {
  const { workspace } = await requireWorkspace();
  const match = await prisma.match.findFirstOrThrow({ where: { id: matchId, workspaceId: workspace.id }, include: matchInclude });
  return serializeMatch(match as never);
}

export async function createMatch(input: Record<string, unknown>) {
  const { workspace } = await requireManagementWorkspace();
  const seasonId = String(input.seasonId || "");
  const competitionId = String(input.competitionId || "");
  const opponentClubId = String(input.opponentClubId || "");
  if (!seasonId || !competitionId || !opponentClubId) throw new Error("Season, competition and opponent are required.");
  const competitionRecord = await prisma.competition.findFirst({
    where: { id: competitionId, workspaceId: workspace.id },
    include: { season: true, clubs: { where: { id: opponentClubId }, select: { id: true, name: true } } }
  });
  if (!competitionRecord || competitionRecord.seasonId !== seasonId || competitionRecord.clubs.length !== 1) throw new Error("The selected opponent does not participate in this competition.");
  const opponent = competitionRecord.clubs[0];
  const title = String(input.title || `${workspace.name} vs ${opponent.name}`).trim();
  const match = await prisma.match.create({
    data: {
      title,
      workspaceId: workspace.id,
      opponentName: opponent.name,
      competition: competitionRecord.name,
      season: competitionRecord.season.name,
      seasonId,
      competitionId,
      opponentClubId,
      roundName: optionalString(input.roundName),
      venue: optionalString(input.venue),
      notes: optionalString(input.notes),
      matchDate: input.matchDate ? new Date(String(input.matchDate)) : null,
      firstHalfAttackDirection: "left_to_right",
      secondHalfAttackDirection: "right_to_left"
    },
    include: matchInclude
  });
  return serializeMatch(match as never);
}

export async function updateMatch(matchId: string, input: Record<string, unknown>) {
  const { workspace } = await requireManagementWorkspace();
  const markerKeys = [
    "firstHalfStartSeconds",
    "firstHalfEndSeconds",
    "secondHalfStartSeconds",
    "secondHalfEndSeconds"
  ] as const;
  const data: Partial<Record<(typeof markerKeys)[number], number | null>> = {};

  for (const key of markerKeys) {
    if (input[key] !== undefined) data[key] = optionalNumber(input[key]);
  }

  const current = await prisma.match.findFirstOrThrow({ where: { id: matchId, workspaceId: workspace.id } });
  const nextMarkers = Object.fromEntries(markerKeys.map((key) => [key, data[key] === undefined ? current[key] : data[key]])) as Record<PeriodMarkerKey, number | null>;
  validatePeriodMarkers(nextMarkers);
  const updateData: Prisma.MatchUncheckedUpdateInput = { ...data };

  const selectionChanged = ["seasonId", "competitionId", "opponentClubId"].some((key) => input[key] !== undefined);
  if (selectionChanged) {
    const seasonId = String(input.seasonId ?? current.seasonId ?? "");
    const competitionId = String(input.competitionId ?? current.competitionId ?? "");
    const opponentClubId = String(input.opponentClubId ?? current.opponentClubId ?? "");
    const competition = await prisma.competition.findFirst({ where: { id: competitionId, workspaceId: workspace.id }, include: { season: true, clubs: { where: { id: opponentClubId, workspaceId: workspace.id }, select: { id: true, name: true } } } });
    if (!competition || competition.seasonId !== seasonId || competition.clubs.length !== 1) throw new Error("The selected opponent does not participate in this competition.");
    updateData.seasonId = seasonId;
    updateData.competitionId = competitionId;
    updateData.opponentClubId = opponentClubId;
    updateData.season = competition.season.name;
    updateData.competition = competition.name;
    updateData.opponentName = competition.clubs[0].name;
    updateData.title = `${workspace.name} vs ${competition.clubs[0].name}`;
  }

  if (input.roundName !== undefined) updateData.roundName = optionalString(input.roundName);
  if (input.venue !== undefined) updateData.venue = optionalString(input.venue);
  if (input.notes !== undefined) updateData.notes = optionalString(input.notes);
  if (input.matchDate !== undefined) updateData.matchDate = input.matchDate ? validDate(input.matchDate) : null;
  updateData.firstHalfAttackDirection = "left_to_right";
  updateData.secondHalfAttackDirection = "right_to_left";

  const match = await prisma.$transaction(async (tx) => {
    await tx.match.update({ where: { id: matchId }, data: updateData });
    await tx.moment.updateMany({ where: { matchId }, data: { period: null } });
    if (nextMarkers.firstHalfStartSeconds !== null && nextMarkers.firstHalfEndSeconds !== null) {
      await tx.moment.updateMany({ where: { matchId, startTimeSeconds: { gte: nextMarkers.firstHalfStartSeconds, lte: nextMarkers.firstHalfEndSeconds } }, data: { period: "first_half" } });
    }
    if (nextMarkers.secondHalfStartSeconds !== null && nextMarkers.secondHalfEndSeconds !== null) {
      await tx.moment.updateMany({ where: { matchId, startTimeSeconds: { gte: nextMarkers.secondHalfStartSeconds, lte: nextMarkers.secondHalfEndSeconds } }, data: { period: "second_half" } });
    }
    return tx.match.findUniqueOrThrow({ where: { id: matchId }, include: matchInclude });
  });
  return serializeMatch(match as never);
}

export async function deleteMatch(matchId: string) {
  const account = await requireManagementWorkspace();
  const { workspace } = account;
  const match = await prisma.match.findFirstOrThrow({ where: { id: matchId, workspaceId: workspace.id }, include: { video: true } });
  if (match.video?.mediaAssetId) {
    const { appId, mediaWorkspace } = await ensureMediaWorkspace(account);
    const asset = await mediaPrisma.mediaAsset.findFirst({ where: { id: match.video.mediaAssetId, mediaWorkspaceId: mediaWorkspace.id } });
    if (asset?.storageStatus === "UPLOADING" && asset.uploadId) {
      await abortMediaMultipartUpload(asset.storageKey, asset.uploadId).catch(() => undefined);
      await mediaPrisma.mediaAsset.update({ where: { id: asset.id }, data: { storageStatus: "FAILED", uploadId: null } });
    }
    await removeMediaReference(appId, match.video.id);
  } else {
    if (match.video?.storageKey && match.video.uploadId) {
      await abortMultipartUpload(match.video.storageKey, match.video.uploadId).catch(() => undefined);
    }
    if (match.video?.storageKey) await deleteR2Object(match.video.storageKey);
  }
  await prisma.match.delete({ where: { id: matchId } });
}

export async function saveVideo(matchId: string, input: Record<string, unknown>) {
  const { workspace } = await requireManagementWorkspace();
  await prisma.match.findFirstOrThrow({ where: { id: matchId, workspaceId: workspace.id }, select: { id: true } });
  const video = await prisma.video.upsert({
    where: { matchId },
    update: {
      fileName: String(input.fileName),
      fileSize: BigInt(Number(input.fileSize)),
      durationSeconds: Number(input.durationSeconds),
      mimeType: String(input.mimeType || "video/mp4"),
      lastModified: input.lastModified ? new Date(String(input.lastModified)) : null
    },
    create: {
      matchId,
      fileName: String(input.fileName),
      fileSize: BigInt(Number(input.fileSize)),
      durationSeconds: Number(input.durationSeconds),
      mimeType: String(input.mimeType || "video/mp4"),
      lastModified: input.lastModified ? new Date(String(input.lastModified)) : null
    }
  });
  return serializeVideo(video);
}

export async function getSettings() {
  const { workspace } = await requireWorkspace();
  const [momentTypes, subMomentTypes] = await Promise.all([
    prisma.momentType.findMany({ where: { workspaceId: workspace.id }, include: { allowedSubmoments: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.subMomentType.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
  ]);
  return { momentTypes, subMomentTypes };
}

export async function createMoment(matchId: string, input: Record<string, unknown>) {
  const { user, workspace } = await requireManagementWorkspace();
  const start = Number(input.startTimeSeconds);
  const end = Number(input.endTimeSeconds);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Invalid moment interval.");
  const match = await prisma.match.findFirstOrThrow({ where: { id: matchId, workspaceId: workspace.id } });
  const momentTypeId = String(input.momentTypeId);
  await prisma.momentType.findFirstOrThrow({ where: { id: momentTypeId, workspaceId: workspace.id }, select: { id: true } });
  return prisma.moment.create({
    data: {
      matchId,
      momentTypeId,
      startTimeSeconds: start,
      endTimeSeconds: end,
      durationSeconds: end - start,
      period: getMatchPeriodAtTime(match, start),
      notes: optionalString(input.notes),
      outcome: optionalString(input.outcome),
      createdByUserId: user.id
    },
    include: { momentType: true, subMoments: { include: { subMomentType: true } }, createdBy: { select: { id: true, name: true, username: true } } }
  });
}

export async function updateMoment(momentId: string, input: Record<string, unknown>) {
  const { user, workspace } = await requireWorkspace();
  const current = await prisma.moment.findFirstOrThrow({ where: { id: momentId, match: { workspaceId: workspace.id } }, include: { match: true } });
  if (current.createdByUserId && current.createdByUserId !== user.id && user.role !== "admin") throw new Error("Only the staff member who tagged this moment can edit it.");
  if (input.momentTypeId !== undefined) {
    const nextType = await prisma.momentType.findFirstOrThrow({
      where: { id: String(input.momentTypeId), workspaceId: workspace.id },
      select: { allowedSubmoments: { select: { id: true } } }
    });
    const existingSubmomentTypes = await prisma.subMoment.findMany({ where: { momentId }, select: { subMomentTypeId: true }, distinct: ["subMomentTypeId"] });
    const allowedIds = new Set(nextType.allowedSubmoments.map((type) => type.id));
    if (existingSubmomentTypes.some((type) => !allowedIds.has(type.subMomentTypeId))) {
      throw new Error("This moment already contains submoments that are not available for the selected moment type.");
    }
  }
  const start = input.startTimeSeconds === undefined ? current.startTimeSeconds : Number(input.startTimeSeconds);
  const end = input.endTimeSeconds === undefined ? current.endTimeSeconds : Number(input.endTimeSeconds);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Invalid moment interval.");
  return prisma.moment.update({
    where: { id: momentId },
    data: {
      momentTypeId: input.momentTypeId === undefined ? undefined : String(input.momentTypeId),
      startTimeSeconds: start,
      endTimeSeconds: end,
      durationSeconds: end - start,
      period: getMatchPeriodAtTime(current.match, start),
      notes: input.notes === undefined ? undefined : optionalString(input.notes),
      outcome: input.outcome === undefined ? undefined : optionalString(input.outcome)
    },
    include: { momentType: true, subMoments: { include: { subMomentType: true } }, createdBy: { select: { id: true, name: true, username: true } } }
  });
}

export async function createSubMoment(momentId: string, input: Record<string, unknown>) {
  const { workspace } = await requireManagementWorkspace();
  const moment = await prisma.moment.findFirstOrThrow({
    where: { id: momentId, match: { workspaceId: workspace.id } },
    select: { id: true, momentType: { select: { allowedSubmoments: { select: { id: true } } } } }
  });
  const type = await prisma.subMomentType.findFirstOrThrow({ where: { id: String(input.subMomentTypeId), workspaceId: workspace.id } });
  if (!moment.momentType.allowedSubmoments.some((allowed) => allowed.id === type.id)) throw new Error("This submoment is not available for the selected moment.");
  const fieldX = optionalCoordinate(input.fieldX);
  const fieldY = optionalCoordinate(input.fieldY);
  const goalX = optionalCoordinate(input.goalX);
  const goalY = optionalCoordinate(input.goalY);
  if (type.requiresFieldLocation && (fieldX === null || fieldY === null)) throw new Error("Mark the occurrence on the field.");
  if (type.requiresGoalLocation && (goalX === null || goalY === null)) throw new Error("Mark the destination on the goal.");
  return prisma.subMoment.create({
    data: {
      momentId,
      subMomentTypeId: type.id,
      timeSeconds: optionalNumber(input.timeSeconds),
      fieldX,
      fieldY,
      goalX,
      goalY,
      foot: optionalString(input.foot),
      notes: optionalString(input.notes),
      outcome: optionalString(input.outcome)
    },
    include: { subMomentType: true }
  });
}

export async function updateSubMoment(subMomentId: string, input: Record<string, unknown>) {
  const { workspace } = await requireManagementWorkspace();
  const current = await prisma.subMoment.findFirstOrThrow({
    where: { id: subMomentId, moment: { match: { workspaceId: workspace.id } } },
    include: { subMomentType: true, moment: { select: { momentType: { select: { allowedSubmoments: { select: { id: true } } } } } } }
  });
  const nextType = input.subMomentTypeId === undefined
    ? current.subMomentType
    : await prisma.subMomentType.findFirstOrThrow({ where: { id: String(input.subMomentTypeId), workspaceId: workspace.id } });
  if (!current.moment.momentType.allowedSubmoments.some((allowed) => allowed.id === nextType.id)) throw new Error("This submoment is not available for the selected moment.");
  const nextFieldX = input.fieldX === undefined ? current.fieldX : optionalCoordinate(input.fieldX);
  const nextFieldY = input.fieldY === undefined ? current.fieldY : optionalCoordinate(input.fieldY);
  const nextGoalX = input.goalX === undefined ? current.goalX : optionalCoordinate(input.goalX);
  const nextGoalY = input.goalY === undefined ? current.goalY : optionalCoordinate(input.goalY);
  if (nextType.requiresFieldLocation && (nextFieldX === null || nextFieldY === null)) throw new Error("Mark the occurrence on the field.");
  if (nextType.requiresGoalLocation && (nextGoalX === null || nextGoalY === null)) throw new Error("Mark the destination on the goal.");
  return prisma.subMoment.update({
    where: { id: subMomentId },
    data: {
      subMomentTypeId: input.subMomentTypeId === undefined ? undefined : String(input.subMomentTypeId),
      timeSeconds: input.timeSeconds === undefined ? undefined : optionalNumber(input.timeSeconds),
      fieldX: input.fieldX === undefined ? undefined : nextFieldX,
      fieldY: input.fieldY === undefined ? undefined : nextFieldY,
      goalX: input.goalX === undefined ? undefined : nextGoalX,
      goalY: input.goalY === undefined ? undefined : nextGoalY,
      foot: input.foot === undefined ? undefined : optionalString(input.foot),
      notes: input.notes === undefined ? undefined : optionalString(input.notes),
      outcome: input.outcome === undefined ? undefined : optionalString(input.outcome)
    },
    include: { subMomentType: true }
  });
}

export async function getMapPoints() {
  const { workspace } = await requireWorkspace();
  const rows = await prisma.subMoment.findMany({
    where: { moment: { match: { workspaceId: workspace.id } } },
    include: {
      subMomentType: true,
      moment: { include: { momentType: true, match: true } }
    },
    orderBy: { createdAt: "asc" }
  });
  return rows.map((point) => {
    const eventTime = point.timeSeconds ?? point.moment.startTimeSeconds;
    const period = getMatchPeriodAtTime(point.moment.match, eventTime);
    return {
    id: point.id,
    matchId: point.moment.matchId,
    matchTitle: point.moment.match.title,
    momentId: point.momentId,
    momentTypeId: point.moment.momentTypeId,
    momentTypeName: point.moment.momentType.name,
    momentStartTimeSeconds: point.moment.startTimeSeconds,
    momentEndTimeSeconds: point.moment.endTimeSeconds,
    subMomentTypeId: point.subMomentTypeId,
    subMomentTypeName: point.subMomentType.name,
    color: point.subMomentType.color,
    timeSeconds: point.timeSeconds,
    fieldX: point.fieldX,
    fieldY: point.fieldY,
    goalX: point.goalX,
    goalY: point.goalY,
      outcome: point.outcome,
      period,
      attackDirection: getAttackDirectionAtTime(point.moment.match, eventTime)
    };
  });
}

export async function saveMomentType(input: Record<string, unknown>, id?: string) {
  const { workspace } = await requireManagementWorkspace();
  const allowedSubmomentIds = Array.isArray(input.allowedSubmomentIds) ? [...new Set(input.allowedSubmomentIds.map(String))] : [];
  const allowedCount = await prisma.subMomentType.count({ where: { id: { in: allowedSubmomentIds }, workspaceId: workspace.id } });
  if (allowedCount !== allowedSubmomentIds.length) throw new Error("One or more selected submoments are invalid.");
  const data = {
    name: String(input.name || "").trim(),
    code: String(input.code || "").trim().toUpperCase(),
    color: String(input.color || "#2dd66f"),
    defaultShortcut: optionalString(input.defaultShortcut),
    sortOrder: Number(input.sortOrder || 0)
  };
  if (!data.name || !data.code) throw new Error("Name and code are required.");
  await validateShortcut(workspace.id, data.defaultShortcut, id);
  if (id) {
    await prisma.momentType.findFirstOrThrow({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    const usedSubmomentTypes = await prisma.subMoment.findMany({
      where: { moment: { momentTypeId: id, match: { workspaceId: workspace.id } } },
      select: { subMomentTypeId: true },
      distinct: ["subMomentTypeId"]
    });
    if (usedSubmomentTypes.some((type) => !allowedSubmomentIds.includes(type.subMomentTypeId))) {
      throw new Error("Keep the submoments already used by this moment type associated with it.");
    }
    return prisma.momentType.update({
      where: { id },
      data: { ...data, allowedSubmoments: { set: allowedSubmomentIds.map((submomentId) => ({ id: submomentId })) } },
      include: { allowedSubmoments: true }
    });
  }
  return prisma.momentType.create({
    data: { ...data, workspaceId: workspace.id, allowedSubmoments: { connect: allowedSubmomentIds.map((submomentId) => ({ id: submomentId })) } },
    include: { allowedSubmoments: true }
  });
}

export async function saveSubMomentType(input: Record<string, unknown>, id?: string) {
  const { workspace } = await requireManagementWorkspace();
  const data = {
    name: String(input.name || "").trim(),
    code: String(input.code || "").trim().toUpperCase(),
    color: String(input.color || "#38bdf8"),
    requiresFieldLocation: input.requiresFieldLocation !== false,
    requiresGoalLocation: input.requiresGoalLocation === true,
    defaultShortcut: optionalString(input.defaultShortcut),
    sortOrder: Number(input.sortOrder || 0)
  };
  if (!data.name || !data.code) throw new Error("Name and code are required.");
  await validateShortcut(workspace.id, data.defaultShortcut, id);
  if (id) {
    await prisma.subMomentType.findFirstOrThrow({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    return prisma.subMomentType.update({ where: { id }, data });
  }
  return prisma.subMomentType.create({ data: { ...data, workspaceId: workspace.id } });
}

export async function deleteMomentType(id: string) {
  const { workspace } = await requireManagementWorkspace();
  await prisma.momentType.findFirstOrThrow({ where: { id, workspaceId: workspace.id }, select: { id: true } });
  if (await prisma.moment.count({ where: { momentTypeId: id } })) throw new Error("This moment type is already used and cannot be deleted. Rename it instead.");
  await prisma.momentType.delete({ where: { id } });
}

export async function deleteSubMomentType(id: string) {
  const { workspace } = await requireManagementWorkspace();
  await prisma.subMomentType.findFirstOrThrow({ where: { id, workspaceId: workspace.id }, select: { id: true } });
  if (await prisma.subMoment.count({ where: { subMomentTypeId: id } })) throw new Error("This submoment type is already used and cannot be deleted. Rename it instead.");
  await prisma.subMomentType.delete({ where: { id } });
}

export async function deleteMoment(id: string) {
  const { user, workspace } = await requireWorkspace();
  const moment = await prisma.moment.findFirstOrThrow({ where: { id, match: { workspaceId: workspace.id } }, select: { id: true, createdByUserId: true } });
  if (moment.createdByUserId && moment.createdByUserId !== user.id && user.role !== "admin") throw new Error("Only the staff member who tagged this moment can delete it.");
  return prisma.moment.delete({ where: { id } });
}

export async function deleteSubMoment(id: string) {
  const { workspace } = await requireManagementWorkspace();
  await prisma.subMoment.findFirstOrThrow({ where: { id, moment: { match: { workspaceId: workspace.id } } }, select: { id: true } });
  return prisma.subMoment.delete({ where: { id } });
}

function optionalString(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return String(value).trim();
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Invalid number.");
  return number;
}

function optionalCoordinate(value: unknown) {
  const number = optionalNumber(value);
  if (number === null) return null;
  if (number < 0 || number > 100) throw new Error("Coordinates must be between 0 and 100.");
  return number;
}

function validDate(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Invalid match date.");
  return date;
}

async function validateShortcut(workspaceId: string, shortcut: string | null, currentId?: string) {
  if (!shortcut) return;
  const key = shortcut.toLowerCase();
  const [moment, submoment] = await Promise.all([
    prisma.momentType.findFirst({ where: { workspaceId, defaultShortcut: { equals: key, mode: "insensitive" }, id: currentId ? { not: currentId } : undefined }, select: { name: true } }),
    prisma.subMomentType.findFirst({ where: { workspaceId, defaultShortcut: { equals: key, mode: "insensitive" }, id: currentId ? { not: currentId } : undefined }, select: { name: true } })
  ]);
  const conflict = moment || submoment;
  if (conflict) throw new Error(`Shortcut “${shortcut}” is already used by ${conflict.name}.`);
}

type PeriodMarkerKey = "firstHalfStartSeconds" | "firstHalfEndSeconds" | "secondHalfStartSeconds" | "secondHalfEndSeconds";

function validatePeriodMarkers(markers: Record<PeriodMarkerKey, number | null>) {
  const ordered = [
    [markers.firstHalfStartSeconds, "Start 1st half"],
    [markers.firstHalfEndSeconds, "End 1st half"],
    [markers.secondHalfStartSeconds, "Start 2nd half"],
    [markers.secondHalfEndSeconds, "End 2nd half"]
  ] as const;
  for (const [seconds, label] of ordered) {
    if (seconds !== null && seconds < 0) throw new Error(`${label} cannot be negative.`);
  }
  let previous: number | null = null;
  for (const [seconds] of ordered) {
    if (seconds === null) continue;
    if (previous !== null && seconds < previous) throw new Error("Match period markers must be saved in chronological order.");
    previous = seconds;
  }
}
