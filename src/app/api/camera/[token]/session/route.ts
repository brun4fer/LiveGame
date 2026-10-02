import { handleApiError } from "@/lib/api";
import { requireActiveCameraPairing } from "@/lib/camera-pairing";
import { startPairedCameraSession } from "@/lib/live-store";

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const { payload, connection } = await requireActiveCameraPairing(token);
    if (!connection.desiredBroadcasting) throw new Error("Wait for the match computer to start the recording.");
    return Response.json(await startPairedCameraSession(payload.matchId, payload.workspaceId, payload.userId), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
