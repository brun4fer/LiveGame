import { requireWorkspace } from "@/lib/auth";
import { cameraPairingTokenHash, createCameraPairingToken } from "@/lib/camera-pairing";
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
    await prisma.wirelessCameraConnection.upsert({
      where: { matchId },
      create: {
        matchId,
        workspaceId: workspace.id,
        pairedByUserId: user.id,
        tokenHash: cameraPairingTokenHash(pairing.token),
        expiresAt: new Date(pairing.expiresAt),
      },
      update: {
        workspaceId: workspace.id,
        pairedByUserId: user.id,
        tokenHash: cameraPairingTokenHash(pairing.token),
        expiresAt: new Date(pairing.expiresAt),
        ready: false,
        desiredBroadcasting: false,
        broadcasting: false,
        endRequested: false,
        commandVersion: { increment: 1 },
        acknowledgedVersion: 0,
        lastSeenAt: null,
        broadcastStartedAt: null,
      },
    });
    return Response.json({ ...pairing, matchTitle: match.title, url: new URL(`/camera/${encodeURIComponent(pairing.token)}`, request.url).toString() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const { workspace } = await requireWorkspace();
    const { matchId } = await context.params;
    await prisma.match.findFirstOrThrow({ where: { id: matchId, workspaceId: workspace.id }, select: { id: true } });
    await prisma.wirelessCameraConnection.deleteMany({ where: { matchId, workspaceId: workspace.id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
