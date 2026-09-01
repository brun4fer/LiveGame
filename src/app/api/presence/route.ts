import { handleApiError, readJson } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ACTIVE_WINDOW_MS = 90_000;
const RETENTION_MS = 24 * 60 * 60 * 1000;

function validClientId(value: unknown) {
  const clientId = typeof value === "string" ? value.trim() : "";
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(clientId)) throw new Error("Invalid presence identity.");
  return clientId;
}

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspace();
    const body = await readJson<{ clientId?: string; liveSessionId?: string | null; playbackPositionSeconds?: number | null; atLiveEdge?: boolean }>(request);
    const value = body.clientId;
    const clientId = validClientId(value);
    const now = new Date();
    const activeAfter = new Date(now.getTime() - ACTIVE_WINDOW_MS);
    const removeBefore = new Date(now.getTime() - RETENTION_MS);

    const liveSessionId = body.liveSessionId === undefined ? undefined : body.liveSessionId;
    if (liveSessionId) await prisma.liveSession.findFirstOrThrow({ where: { id: liveSessionId, match: { workspaceId: workspace.id } }, select: { id: true } });
    const playbackPositionSeconds = body.playbackPositionSeconds === undefined || body.playbackPositionSeconds === null ? body.playbackPositionSeconds : Number(body.playbackPositionSeconds);
    if (typeof playbackPositionSeconds === "number" && (!Number.isFinite(playbackPositionSeconds) || playbackPositionSeconds < 0)) throw new Error("Invalid live playback position.");

    const result = await prisma.$transaction(async (tx) => {
      await tx.workspacePresence.deleteMany({ where: { lastSeenAt: { lt: removeBefore } } });
      await tx.workspacePresence.upsert({
        where: { workspaceId_clientId: { workspaceId: workspace.id, clientId } },
        create: { workspaceId: workspace.id, userId: user.id, clientId, lastSeenAt: now, liveSessionId: liveSessionId ?? null, playbackPositionSeconds: playbackPositionSeconds ?? null, atLiveEdge: body.atLiveEdge ?? true },
        update: { userId: user.id, lastSeenAt: now, liveSessionId, playbackPositionSeconds, atLiveEdge: body.atLiveEdge },
      });
      const active = await tx.workspacePresence.findMany({
        where: { workspaceId: workspace.id, lastSeenAt: { gte: activeAfter } },
        include: { user: { select: { id: true, name: true, username: true } } },
      });
      return { active, otherActiveSessions: active.filter((item) => item.clientId !== clientId).length };
    });

    return Response.json({
      activeElsewhere: result.otherActiveSessions > 0,
      otherActiveSessions: result.otherActiveSessions,
      liveViewers: liveSessionId ? result.active.filter((item) => item.liveSessionId === liveSessionId).map((item) => ({ user: item.user, atLiveEdge: item.atLiveEdge, playbackPositionSeconds: item.playbackPositionSeconds })) : [],
    });
  } catch (error) { return handleApiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const { workspace } = await requireWorkspace();
    const { clientId: value } = await readJson<{ clientId?: string }>(request);
    const clientId = validClientId(value);
    await prisma.workspacePresence.deleteMany({ where: { workspaceId: workspace.id, clientId } });
    return Response.json({ removed: true });
  } catch (error) { return handleApiError(error); }
}
