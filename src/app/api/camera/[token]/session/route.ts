import { handleApiError } from "@/lib/api";
import { requireCameraPairing } from "@/lib/camera-pairing";
import { startPairedCameraSession } from "@/lib/live-store";

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const { payload } = await requireCameraPairing(token);
    return Response.json(await startPairedCameraSession(payload.matchId, payload.workspaceId, payload.userId), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
