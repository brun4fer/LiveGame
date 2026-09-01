import { cookies } from "next/headers";

import { handleApiError, readJson } from "@/lib/api";
import { createSessionToken, requireAccount, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { joinWorkspaceWithInvite } from "@/lib/workspace";

export async function POST(request: Request) {
  try {
    const account = await requireAccount();
    const body = await readJson<{ code?: string }>(request);
    const joined = await joinWorkspaceWithInvite(account.user.id, body.code);
    const token = createSessionToken({
      userId: account.user.id,
      username: account.user.username,
      role: joined.role,
      mustChangePassword: account.user.mustChangePassword,
      needsOnboarding: false,
      managementAccessVersion: null,
    });
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
    return Response.json({ id: joined.workspace.id, name: joined.workspace.name });
  } catch (error) {
    return handleApiError(error);
  }
}
