import { requireAccount } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { isManagementPasswordEnabled } from "@/lib/management-access";

export async function GET() {
  try {
    const { user, workspace, session } = await requireAccount();
    const managementPasswordEnabled = isManagementPasswordEnabled();
    return Response.json({
      id: user.id,
      name: user.name,
      username: user.username,
      teamName: workspace?.name ?? null,
      needsOnboarding: !workspace,
      managementAccess: {
        configured: !managementPasswordEnabled || Boolean(workspace?.managementPasswordHash),
        unlocked: !managementPasswordEnabled || Boolean(workspace?.managementPasswordHash && session.managementAccessVersion === workspace.managementPasswordVersion)
      }
    });
  } catch (error) { return handleApiError(error); }
}
