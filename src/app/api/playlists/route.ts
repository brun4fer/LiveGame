import { handleApiError, readJson } from "@/lib/api";
import { createPlaylist, listAvailablePlaylists } from "@/lib/playlists";

export async function GET() {
  try {
    return Response.json(await listAvailablePlaylists());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    return Response.json(await createPlaylist(await readJson<Record<string, unknown>>(request)), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
