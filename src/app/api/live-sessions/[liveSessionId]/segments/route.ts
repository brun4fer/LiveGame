import { handleApiError, readJson } from "@/lib/api";
import { prepareRecordingSegment } from "@/lib/live-store";

export async function POST(request: Request, context: { params: Promise<{ liveSessionId: string }> }) {
  try {
    const { liveSessionId } = await context.params;
    return Response.json(await prepareRecordingSegment(liveSessionId, await readJson<Record<string, unknown>>(request)), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
