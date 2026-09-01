import { cookies } from "next/headers";

import { handleApiError, readJson } from "@/lib/api";
import {
  createSessionToken,
  hashPassword,
  requireAccount,
  requireManagementWorkspace,
  SESSION_COOKIE,
  sessionCookieOptions,
  validateManagementPassword,
  verifyPassword
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function readManagementPassword(value: unknown) {
  const password = String(value || "");
  validateManagementPassword(password);
  return password;
}

async function unlockSession(account: Awaited<ReturnType<typeof requireAccount>>, managementAccessVersion: number) {
  (await cookies()).set(SESSION_COOKIE, createSessionToken({
    userId: account.user.id,
    username: account.user.username,
    role: account.user.role,
    mustChangePassword: account.user.mustChangePassword,
    needsOnboarding: !account.workspace,
    managementAccessVersion
  }), sessionCookieOptions);
}

export async function POST(request: Request) {
  try {
    const account = await requireAccount();
    if (!account.workspace) throw new Error("Complete the team setup before continuing.");
    const body = await readJson<Record<string, unknown>>(request);
    const action = String(body.action || "");

    if (action === "setup") {
      if (account.workspace.managementPasswordHash) throw new Error("A management password has already been created.");
      const password = readManagementPassword(body.password);
      const workspace = await prisma.workspace.update({
        where: { id: account.workspace.id },
        data: { managementPasswordHash: hashPassword(password), managementPasswordVersion: { increment: 1 } }
      });
      await unlockSession(account, workspace.managementPasswordVersion);
      return Response.json({ configured: true, unlocked: true });
    }

    if (action === "unlock") {
      const password = String(body.password || "");
      if (!account.workspace.managementPasswordHash || !verifyPassword(password, account.workspace.managementPasswordHash)) {
        throw new Error("Incorrect management password.");
      }
      await unlockSession(account, account.workspace.managementPasswordVersion);
      return Response.json({ configured: true, unlocked: true });
    }

    if (action === "reset") {
      const accountPassword = String(body.accountPassword || "");
      if (!account.user.passwordHash || !verifyPassword(accountPassword, account.user.passwordHash)) {
        throw new Error("Incorrect sign-in password.");
      }
      const password = readManagementPassword(body.password);
      const workspace = await prisma.workspace.update({
        where: { id: account.workspace.id },
        data: { managementPasswordHash: hashPassword(password), managementPasswordVersion: { increment: 1 } }
      });
      await unlockSession(account, workspace.managementPasswordVersion);
      return Response.json({ configured: true, unlocked: true });
    }

    throw new Error("Invalid management access action.");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const account = await requireManagementWorkspace();
    const body = await readJson<Record<string, unknown>>(request);
    const currentPassword = String(body.currentPassword || "");
    if (!account.workspace.managementPasswordHash || !verifyPassword(currentPassword, account.workspace.managementPasswordHash)) {
      throw new Error("The current management password is incorrect.");
    }
    const password = readManagementPassword(body.password);
    const workspace = await prisma.workspace.update({
      where: { id: account.workspace.id },
      data: { managementPasswordHash: hashPassword(password), managementPasswordVersion: { increment: 1 } }
    });
    await unlockSession(account, workspace.managementPasswordVersion);
    return Response.json({ changed: true });
  } catch (error) {
    return handleApiError(error);
  }
}

