import { handleApiError } from "@/lib/api";
import { getMapPoints } from "@/lib/data-store";

export async function GET() {
  try { return Response.json(await getMapPoints()); }
  catch (error) { return handleApiError(error); }
}

