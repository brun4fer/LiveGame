import { handleApiError } from "@/lib/api";
import { getLiveSession } from "@/lib/live-store";

export async function GET(_request: Request, context: { params: Promise<{ liveSessionId: string }> }) {
  try {
    return Response.json(await getLiveSession((await context.params).liveSessionId));
  } catch (error) {
    return handleApiError(error);
  }
}
