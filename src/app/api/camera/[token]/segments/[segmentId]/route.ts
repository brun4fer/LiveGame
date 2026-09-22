import { handleApiError, readJson } from "@/lib/api";
import { requireCameraPairing } from "@/lib/camera-pairing";
import { completePairedRecordingSegment, failPairedRecordingSegment } from "@/lib/live-store";

export async function PATCH(request: Request, context: { params: Promise<{ token: string; segmentId: string }> }) {
  try {
    const { token, segmentId } = await context.params;
    const { payload } = await requireCameraPairing(token);
    const input = await readJson<Record<string, unknown>>(request);
    return Response.json(await completePairedRecordingSegment(payload.workspaceId, payload.matchId, String(input.liveSessionId || ""), segmentId, input));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ token: string; segmentId: string }> }) {
  try {
    const { token, segmentId } = await context.params;
    const { payload } = await requireCameraPairing(token);
    const liveSessionId = new URL(request.url).searchParams.get("liveSessionId") || "";
    await failPairedRecordingSegment(payload.workspaceId, payload.matchId, liveSessionId, segmentId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
