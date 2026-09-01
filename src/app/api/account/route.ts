import { requireAccount } from "@/lib/auth";
import { handleApiError } from "@/lib/api";

export async function GET() {
  try {
    const { user, workspace, session } = await requireAccount();
    return Response.json({
      id: user.id,
      name: user.name,
      username: user.username,
      teamName: workspace?.name ?? null,
      needsOnboarding: !workspace,
      managementAccess: {
        configured: Boolean(workspace?.managementPasswordHash),
        unlocked: Boolean(workspace?.managementPasswordHash && session.managementAccessVersion === workspace.managementPasswordVersion)
      }
    });
  } catch (error) { return handleApiError(error); }
}

