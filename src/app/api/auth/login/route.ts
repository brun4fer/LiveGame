import { cookies } from "next/headers";

import { createSessionToken, ensureInitialAdmin, SESSION_COOKIE, sessionCookieOptions, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { username?: string; password?: string };
    await ensureInitialAdmin();
    const username = body.username?.trim().toLowerCase() || "";
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user?.passwordHash || !body.password || !verifyPassword(body.password, user.passwordHash)) {
      return Response.json({ error: "Invalid username or password." }, { status: 401 });
    }
    const needsOnboarding = !user.workspaceId;
    const token = createSessionToken({ userId: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword, needsOnboarding });
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
    return Response.json({ name: user.name, mustChangePassword: user.mustChangePassword, needsOnboarding });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not sign in." }, { status: 400 });
  }
}

