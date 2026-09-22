import { requireWorkspace } from "@/lib/auth";
import { createCameraPairingToken } from "@/lib/camera-pairing";
import { cloudflareStreamConfigured } from "@/lib/cloudflare-stream";
import { handleApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    if (!cloudflareStreamConfigured()) throw new Error("Cloudflare Stream must be enabled before pairing a wireless phone camera.");
    const { user, workspace } = await requireWorkspace();
    const { matchId } = await context.params;
    const match = await prisma.match.findFirstOrThrow({ where: { id: matchId, workspaceId: workspace.id }, select: { title: true } });
    const pairing = createCameraPairingToken({ matchId, workspaceId: workspace.id, userId: user.id });
    return Response.json({ ...pairing, matchTitle: match.title, url: new URL(`/camera/${encodeURIComponent(pairing.token)}`, request.url).toString() });
  } catch (error) {
    return handleApiError(error);
  }
}
