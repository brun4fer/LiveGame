import { handleApiError, readJson } from "@/lib/api";
import { saveSubMomentType } from "@/lib/data-store";

export async function POST(request: Request) {
  try { return Response.json(await saveSubMomentType(await readJson<Record<string, unknown>>(request)), { status: 201 }); }
  catch (error) { return handleApiError(error); }
}

