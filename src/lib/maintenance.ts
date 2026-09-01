import { prisma } from "@/lib/prisma";
import { requireManagementWorkspace, requireWorkspace } from "@/lib/auth";

export type MaintenanceResource = "seasons" | "clubs" | "competitions";

export function isMaintenanceResource(value: string): value is MaintenanceResource {
  return value === "seasons" || value === "clubs" || value === "competitions";
}

export async function listMaintenance(resource: MaintenanceResource) {
  const { workspace } = await requireWorkspace();
  if (resource === "seasons") return prisma.season.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ startDate: "desc" }, { name: "desc" }] });
  if (resource === "clubs") return prisma.club.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } });
  const records = await prisma.competition.findMany({ where: { workspaceId: workspace.id }, include: { clubs: { select: { id: true } } }, orderBy: [{ season: { startDate: "desc" } }, { name: "asc" }] });
  return records.map(({ clubs, ...record }) => ({ ...record, clubIds: clubs.map((club) => club.id) }));
}

export async function createMaintenance(resource: MaintenanceResource, input: Record<string, unknown>) {
  const { workspace } = await requireManagementWorkspace();
  const data = await maintenanceData(resource, input, workspace.id);
  try {
    if (resource === "seasons") return await prisma.season.create({ data: { ...data.season!, workspaceId: workspace.id } });
    if (resource === "clubs") return await prisma.club.create({ data: { ...data.club!, workspaceId: workspace.id } });
    const competition = data.competition!;
    return await prisma.competition.create({ data: { name: competition.name, seasonId: competition.seasonId, workspaceId: workspace.id, clubs: { connect: competition.clubIds.map((id) => ({ id })) } } });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error("A record with this name already exists.");
    throw error;
  }
}

export async function updateMaintenance(resource: MaintenanceResource, id: string, input: Record<string, unknown>) {
  const { workspace } = await requireManagementWorkspace();
  const data = await maintenanceData(resource, input, workspace.id);
  try {
    if (resource === "seasons") {
      await prisma.season.findFirstOrThrow({ where: { id, workspaceId: workspace.id }, select: { id: true } });
      const saved = await prisma.$transaction(async (tx) => {
        const record = await tx.season.update({ where: { id }, data: data.season! });
        await tx.match.updateMany({ where: { seasonId: id }, data: { season: record.name } });
        return record;
      });
      return saved;
    }
    if (resource === "clubs") {
      await prisma.club.findFirstOrThrow({ where: { id, workspaceId: workspace.id }, select: { id: true } });
      const saved = await prisma.$transaction(async (tx) => {
        const record = await tx.club.update({ where: { id }, data: data.club! });
        await tx.match.updateMany({ where: { opponentClubId: id }, data: { opponentName: record.name } });
        const matches = await tx.match.findMany({ where: { opponentClubId: id }, select: { id: true } });
        for (const match of matches) await tx.match.update({ where: { id: match.id }, data: { title: `${workspace.name} vs ${record.name}` } });
        return record;
      });
      return saved;
    }
    await prisma.competition.findFirstOrThrow({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    return await prisma.$transaction(async (tx) => {
      const competition = data.competition!;
      const record = await tx.competition.update({
        where: { id },
        data: {
          name: competition.name,
          seasonId: competition.seasonId,
          clubs: { set: competition.clubIds.map((clubId) => ({ id: clubId })) }
        },
        include: { season: { select: { name: true } } }
      });
      await tx.match.updateMany({
        where: { competitionId: id },
        data: { competition: record.name, seasonId: record.seasonId, season: record.season.name }
      });
      return record;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error("A record with this name already exists.");
    throw error;
  }
}

export async function deleteMaintenance(resource: MaintenanceResource, id: string) {
  const { workspace } = await requireManagementWorkspace();
  if (resource === "seasons") {
    await prisma.season.findFirstOrThrow({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    const [matches, competitions] = await Promise.all([prisma.match.count({ where: { seasonId: id } }), prisma.competition.count({ where: { seasonId: id } })]);
    if (matches || competitions) throw new Error("This season is in use. Remove or reassign its matches and competitions first.");
    await prisma.season.delete({ where: { id } });
    return;
  }
  if (resource === "clubs") {
    await prisma.club.findFirstOrThrow({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    if (await prisma.match.count({ where: { opponentClubId: id } })) throw new Error("This club is used by a match and cannot be deleted.");
    await prisma.club.delete({ where: { id } });
    return;
  }
  await prisma.competition.findFirstOrThrow({ where: { id, workspaceId: workspace.id }, select: { id: true } });
  if (await prisma.match.count({ where: { competitionId: id, workspaceId: workspace.id } })) throw new Error("This competition is used by a match and cannot be deleted.");
  await prisma.competition.delete({ where: { id } });
}

async function maintenanceData(resource: MaintenanceResource, input: Record<string, unknown>, workspaceId: string) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Name is required.");

  if (resource === "seasons") {
    const startDate = optionalDate(input.startDate);
    const endDate = optionalDate(input.endDate);
    if (startDate && endDate && endDate < startDate) throw new Error("The season end date must be after its start date.");
    return { season: { name, startDate, endDate } };
  }
  if (resource === "clubs") return { club: { name, shortName: optionalText(input.shortName) } };

  const seasonId = String(input.seasonId || "");
  const clubIds = [...new Set(Array.isArray(input.clubIds) ? input.clubIds.map(String) : [])];
  const [season, clubCount] = await Promise.all([
    prisma.season.findFirst({ where: { id: seasonId, workspaceId }, select: { id: true } }),
    prisma.club.count({ where: { id: { in: clubIds }, workspaceId } })
  ]);
  if (!season) throw new Error("Select a valid season.");
  if (clubIds.length === 0 || clubCount !== clubIds.length) throw new Error("Select at least one valid participating club.");
  return { competition: { name, seasonId, clubIds } };
}

function optionalText(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function optionalDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date.");
  return date;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

