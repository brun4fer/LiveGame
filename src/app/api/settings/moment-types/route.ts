import { handleApiError, readJson } from "@/lib/api";
import { saveMomentType } from "@/lib/data-store";

export async function POST(request: Request) {
  try { return Response.json(await saveMomentType(await readJson<Record<string, unknown>>(request)), { status: 201 }); }
  catch (error) { return handleApiError(error); }
}

