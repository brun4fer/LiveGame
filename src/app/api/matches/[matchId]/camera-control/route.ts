import { handleApiError } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";
import { startPairedCameraSession } from "@/lib/live-store";
import { prisma } from "@/lib/prisma";

const ONLINE_WINDOW_MS = 15_000;

function serialize(connection: {
  ready: boolean;
  desiredBroadcasting: boolean;
  broadcasting: boolean;
  endRequested: boolean;
  commandVersion: number;
  acknowledgedVersion: number;
  lastSeenAt: Date | null;
  broadcastStartedAt: Date | null;
  expiresAt: Date;
}) {
  const online = Boolean(connection.lastSeenAt && Date.now() - connection.lastSeenAt.getTime() <= ONLINE_WINDOW_MS);
  return {
    paired: connection.expiresAt.getTime() > Date.now(),
    online,
    ready: connection.ready && online,
    desiredBroadcasting: connection.desiredBroadcasting,
    broadcasting: connection.broadcasting && online,
    endRequested: connection.endRequested,
    commandVersion: connection.commandVersion,
    acknowledgedVersion: connection.acknowledgedVersion,
    lastSeenAt: connection.lastSeenAt?.toISOString() ?? null,
    broadcastStartedAt: connection.broadcastStartedAt?.toISOString() ?? null,
    expiresAt: connection.expiresAt.toISOString(),
  };
}

async function connectionForMatch(matchId: string, workspaceId: string) {
  await prisma.match.findFirstOrThrow({ where: { id: matchId, workspaceId }, select: { id: true } });
  return prisma.wirelessCameraConnection.findFirst({ where: { matchId, workspaceId, expiresAt: { gt: new Date() } } });
}

export async function GET(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const { workspace } = await requireWorkspace();
    const { matchId } = await context.params;
    const connection = await connectionForMatch(matchId, workspace.id);
    return Response.json(connection ? serialize(connection) : {
      paired: false,
      online: false,
      ready: false,
      desiredBroadcasting: false,
      broadcasting: false,
      endRequested: false,
      commandVersion: 0,
      acknowledgedVersion: 0,
      lastSeenAt: null,
      broadcastStartedAt: null,
      expiresAt: null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const { workspace } = await requireWorkspace();
    const { matchId } = await context.params;
    const body = await request.json() as { command?: unknown };
    const command = String(body.command || "");
    if (!(["start", "stop", "end"] as const).includes(command as "start" | "stop" | "end")) throw new Error("Invalid wireless camera command.");
    const connection = await connectionForMatch(matchId, workspace.id);
    if (!connection) throw new Error("Pair the phone camera before controlling it from this computer.");
    const online = Boolean(connection.lastSeenAt && Date.now() - connection.lastSeenAt.getTime() <= ONLINE_WINDOW_MS);
    if (command === "start" && (!connection.ready || !online)) throw new Error("Open the QR link on the phone, connect its camera and keep that page open first.");

    const saved = await prisma.wirelessCameraConnection.update({
      where: { id: connection.id },
      data: {
        desiredBroadcasting: command === "start",
        endRequested: command === "end",
        commandVersion: { increment: 1 },
      },
    });

    if (command === "start") {
      try {
        const session = await startPairedCameraSession(matchId, workspace.id, connection.pairedByUserId);
        return Response.json({ ...serialize(saved), session });
      } catch (error) {
        await prisma.wirelessCameraConnection.update({
          where: { id: connection.id },
          data: { desiredBroadcasting: false, commandVersion: { increment: 1 } },
        });
        throw error;
      }
    }

    return Response.json(serialize(saved));
  } catch (error) {
    return handleApiError(error);
  }
}
