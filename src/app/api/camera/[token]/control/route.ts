import { handleApiError } from "@/lib/api";
import { requireActiveCameraPairing } from "@/lib/camera-pairing";
import { prisma } from "@/lib/prisma";

function serialize(connection: {
  desiredBroadcasting: boolean;
  endRequested: boolean;
  commandVersion: number;
  expiresAt: Date;
}) {
  return {
    desiredBroadcasting: connection.desiredBroadcasting,
    endRequested: connection.endRequested,
    commandVersion: connection.commandVersion,
    expiresAt: connection.expiresAt.toISOString(),
  };
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const { connection } = await requireActiveCameraPairing(token);
    const saved = await prisma.wirelessCameraConnection.update({
      where: { id: connection.id },
      data: { lastSeenAt: new Date() },
    });
    return Response.json(serialize(saved));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const { connection } = await requireActiveCameraPairing(token);
    const body = await request.json() as { state?: unknown; commandVersion?: unknown };
    const state = String(body.state || "");
    if (!(["READY", "BROADCASTING", "DISCONNECTED"] as const).includes(state as "READY" | "BROADCASTING" | "DISCONNECTED")) throw new Error("Invalid phone camera state.");
    const requestedVersion = Number(body.commandVersion);
    const acknowledgedVersion = Number.isInteger(requestedVersion)
      ? Math.max(connection.acknowledgedVersion, Math.min(requestedVersion, connection.commandVersion))
      : connection.acknowledgedVersion;
    const saved = await prisma.wirelessCameraConnection.update({
      where: { id: connection.id },
      data: {
        ready: state !== "DISCONNECTED",
        broadcasting: state === "BROADCASTING",
        ...(state === "BROADCASTING" && !connection.broadcasting ? { broadcastStartedAt: new Date() } : {}),
        acknowledgedVersion,
        lastSeenAt: new Date(),
      },
    });
    return Response.json(serialize(saved));
  } catch (error) {
    return handleApiError(error);
  }
}
