import { handleApiError, readJson } from "@/lib/api";
import { completeRecordingSegment, failRecordingSegment } from "@/lib/live-store";

export async function PATCH(request: Request, context: { params: Promise<{ liveSessionId: string; segmentId: string }> }) {
  try {
    const { liveSessionId, segmentId } = await context.params;
    return Response.json(await completeRecordingSegment(liveSessionId, segmentId, await readJson<Record<string, unknown>>(request)));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ liveSessionId: string; segmentId: string }> }) {
  try {
    const { liveSessionId, segmentId } = await context.params;
    await failRecordingSegment(liveSessionId, segmentId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
