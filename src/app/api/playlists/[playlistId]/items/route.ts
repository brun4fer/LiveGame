import { handleApiError, readJson } from "@/lib/api";
import { addMomentToPlaylist } from "@/lib/playlists";

export async function POST(request: Request, context: { params: Promise<{ playlistId: string }> }) {
  try {
    const { playlistId } = await context.params;
    return Response.json(await addMomentToPlaylist(playlistId, await readJson<Record<string, unknown>>(request)), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
