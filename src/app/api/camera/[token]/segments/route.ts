import { handleApiError, readJson } from "@/lib/api";
import { requireCameraPairing } from "@/lib/camera-pairing";
import { preparePairedRecordingSegment } from "@/lib/live-store";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const { payload } = await requireCameraPairing(token);
    const input = await readJson<Record<string, unknown>>(request);
    return Response.json(await preparePairedRecordingSegment(payload.workspaceId, payload.matchId, String(input.liveSessionId || ""), input), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
