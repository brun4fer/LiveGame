import { handleApiError, noContent, readJson } from "@/lib/api";
import { deleteSubMomentType, saveSubMomentType } from "@/lib/data-store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json(await saveSubMomentType(await readJson<Record<string, unknown>>(request), (await context.params).id)); }
  catch (error) { return handleApiError(error); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { await deleteSubMomentType((await context.params).id); return noContent(); }
  catch (error) { return handleApiError(error); }
}

