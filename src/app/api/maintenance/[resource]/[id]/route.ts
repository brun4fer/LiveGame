import { handleApiError, noContent, readJson } from "@/lib/api";
import { deleteMaintenance, isMaintenanceResource, updateMaintenance } from "@/lib/maintenance";

export async function PATCH(request: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  try {
    const { resource, id } = await context.params;
    if (!isMaintenanceResource(resource)) return Response.json({ error: "Invalid maintenance resource." }, { status: 404 });
    return Response.json(await updateMaintenance(resource, id, await readJson<Record<string, unknown>>(request)));
  } catch (error) { return handleApiError(error); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  try {
    const { resource, id } = await context.params;
    if (!isMaintenanceResource(resource)) return Response.json({ error: "Invalid maintenance resource." }, { status: 404 });
    await deleteMaintenance(resource, id);
    return noContent();
  } catch (error) { return handleApiError(error); }
}

