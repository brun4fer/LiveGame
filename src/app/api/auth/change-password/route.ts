import { cookies } from "next/headers";

import { createSessionToken, hashPassword, readSessionToken, SESSION_COOKIE, sessionCookieOptions, validatePassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const jar = await cookies();
  const session = readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!session) return Response.json({ error: "Invalid session." }, { status: 401 });
  try {
    const body = await request.json() as { currentPassword?: string; newPassword?: string };
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user?.passwordHash || !body.currentPassword || !verifyPassword(body.currentPassword, user.passwordHash)) throw new Error("The current password is incorrect.");
    validatePassword(body.newPassword || "");
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(body.newPassword!), mustChangePassword: false } });
    jar.set(SESSION_COOKIE, createSessionToken({ userId: user.id, username: user.username, role: user.role, mustChangePassword: false, needsOnboarding: !user.workspaceId }), sessionCookieOptions);
    return Response.json({ ok: true, needsOnboarding: !user.workspaceId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not change the password." }, { status: 400 });
  }
}

