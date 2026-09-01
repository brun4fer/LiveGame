import { handleApiError } from "@/lib/api";
import { removePlaylistItem } from "@/lib/playlists";

export async function DELETE(_request: Request, context: { params: Promise<{ playlistId: string; itemId: string }> }) {
  try {
    const { playlistId, itemId } = await context.params;
    await removePlaylistItem(playlistId, itemId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
