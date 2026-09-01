import { prisma } from "@/lib/prisma";
import { requireManagementWorkspace } from "@/lib/auth";

export async function GET() {
  const { workspace } = await requireManagementWorkspace();
  const matchWhere = { workspaceId: workspace.id };
  const [seasons, clubs, competitions, matches, videos, momentTypes, subMomentTypes, moments, subMoments, liveSessions, recordingSegments, playlists, playlistItems] = await Promise.all([
    prisma.season.findMany({ where: matchWhere }),
    prisma.club.findMany({ where: matchWhere }),
    prisma.competition.findMany({ where: matchWhere, include: { clubs: { select: { id: true } } } }),
    prisma.match.findMany({ where: matchWhere }),
    prisma.video.findMany({ where: { match: matchWhere } }),
    prisma.momentType.findMany({ where: matchWhere, include: { allowedSubmoments: { select: { id: true } } } }),
    prisma.subMomentType.findMany({ where: matchWhere }),
    prisma.moment.findMany({ where: { match: matchWhere } }),
    prisma.subMoment.findMany({ where: { moment: { match: matchWhere } } }),
    prisma.liveSession.findMany({ where: { match: matchWhere } }),
    prisma.recordingSegment.findMany({ where: { liveSession: { match: matchWhere } } }),
    prisma.playlist.findMany({ where: matchWhere }),
    prisma.playlistItem.findMany({ where: { playlist: matchWhere } })
  ]);
  const payload = { version: 4, team: workspace.name, exportedAt: new Date().toISOString(), seasons, clubs, competitions: competitions.map(({ clubs: linked, ...item }) => ({ ...item, clubIds: linked.map((club) => club.id) })), matches, videos, momentTypes: momentTypes.map(({ allowedSubmoments, ...item }) => ({ ...item, allowedSubmomentIds: allowedSubmoments.map((submoment) => submoment.id) })), subMomentTypes, moments, subMoments, liveSessions, recordingSegments, playlists, playlistItems };
  const body = JSON.stringify(payload, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2);
  const date = new Date().toISOString().slice(0, 10);
  const safeTeam = workspace.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "team";
  return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${safeTeam}-analysis-backup-${date}.json"`, "Cache-Control": "no-store" } });
}
