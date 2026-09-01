import { handleApiError } from "@/lib/api";
import { getSettings } from "@/lib/data-store";

export async function GET() {
  try { return Response.json(await getSettings()); }
  catch (error) { return handleApiError(error); }
}

