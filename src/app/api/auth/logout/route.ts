import { cookies } from "next/headers";
import { requireAccount, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { clientId?: unknown };
    const clientId = typeof body.clientId === "string" && /^[a-zA-Z0-9_-]{16,100}$/.test(body.clientId) ? body.clientId : null;
    const account = await requireAccount().catch(() => null);
    if (clientId && account?.workspace) {
      await prisma.workspacePresence.deleteMany({ where: { workspaceId: account.workspace.id, clientId } });
    }
  } finally {
    (await cookies()).delete(SESSION_COOKIE);
  }
  return Response.json({ ok: true });
}

