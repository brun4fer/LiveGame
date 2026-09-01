import { handleApiError, readJson } from "@/lib/api";
import { requireManagementWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createWorkspaceInvite } from "@/lib/workspace";

export async function GET() {
  try {
    const { workspace } = await requireManagementWorkspace();
    const [members, invites] = await Promise.all([
      prisma.user.findMany({
        where: { workspaceId: workspace.id },
        select: { id: true, name: true, username: true, role: true },
        orderBy: { name: "asc" },
      }),
      prisma.workspaceInvite.findMany({
        where: { workspaceId: workspace.id, claimedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, role: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return Response.json({ members, invites });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireManagementWorkspace();
    const body = await readJson<{ role?: string }>(request);
    return Response.json(await createWorkspaceInvite(user.id, workspace.id, body.role), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
