import { handleApiError, noContent, readJson } from "@/lib/api";
import { deleteMatch, getMatch, updateMatch } from "@/lib/data-store";

export async function GET(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  try { return Response.json(await getMatch((await context.params).matchId)); }
  catch (error) { return handleApiError(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try { return Response.json(await updateMatch((await context.params).matchId, await readJson<Record<string, unknown>>(request))); }
  catch (error) { return handleApiError(error); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  try { await deleteMatch((await context.params).matchId); return noContent(); }
  catch (error) { return handleApiError(error); }
}

