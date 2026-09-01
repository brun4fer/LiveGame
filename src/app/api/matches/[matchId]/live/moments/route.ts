import { handleApiError, readJson } from "@/lib/api";
import { markLiveMoment } from "@/lib/live-store";

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await context.params;
    return Response.json(await markLiveMoment(matchId, await readJson<Record<string, unknown>>(request)), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
