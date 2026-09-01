import { handleApiError, readJson } from "@/lib/api";
import { createSubMoment } from "@/lib/data-store";

export async function POST(request: Request, context: { params: Promise<{ momentId: string }> }) {
  try { return Response.json(await createSubMoment((await context.params).momentId, await readJson<Record<string, unknown>>(request)), { status: 201 }); }
  catch (error) { return handleApiError(error); }
}

