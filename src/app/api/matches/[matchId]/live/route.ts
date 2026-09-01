import { handleApiError, readJson } from "@/lib/api";
import { getCurrentLiveSession, startLiveSession, stopLiveSession } from "@/lib/live-store";

export async function GET(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await context.params;
    const rawAfter = new URL(request.url).searchParams.get("afterSequence");
    const afterSequence = rawAfter === null ? undefined : Number(rawAfter);
    if (afterSequence !== undefined && (!Number.isInteger(afterSequence) || afterSequence < -1)) return Response.json({ error: "Invalid segment cursor." }, { status: 400 });
    return Response.json(await getCurrentLiveSession(matchId, afterSequence));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await context.params;
    return Response.json(await startLiveSession(matchId, await readJson<Record<string, unknown>>(request)), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await context.params;
    return Response.json(await stopLiveSession(matchId));
  } catch (error) {
    return handleApiError(error);
  }
}
