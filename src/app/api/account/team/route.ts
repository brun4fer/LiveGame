import { cookies } from "next/headers";

import { handleApiError, readJson } from "@/lib/api";
import { createSessionToken, requireAccount, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { createWorkspaceForUser } from "@/lib/workspace";

export async function POST(request: Request) {
  try {
    const { user } = await requireAccount();
    const body = await readJson<{ teamName?: string }>(request);
    const workspace = await createWorkspaceForUser(user.id, body.teamName);
    (await cookies()).set(SESSION_COOKIE, createSessionToken({ userId: user.id, username: user.username, role: "admin", mustChangePassword: false, needsOnboarding: false }), sessionCookieOptions);
    return Response.json({ teamName: workspace.name }, { status: 201 });
  } catch (error) { return handleApiError(error); }
}
