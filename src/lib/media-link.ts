import { createHash, randomBytes } from "node:crypto";

import { mediaPrisma } from "@/lib/media-prisma";
import { ensureMediaWorkspace } from "@/lib/media-workspace";

type LocalAccount = Parameters<typeof ensureMediaWorkspace>[0];

function tokenHash(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export async function getMediaLinkStatus(account: LocalAccount) {
  const { mediaWorkspace } = await ensureMediaWorkspace(account);
  const accounts = await mediaPrisma.mediaAccount.findMany({
    where: { mediaWorkspaceId: mediaWorkspace.id },
    select: { appId: true },
    orderBy: { appId: "asc" },
  });
  return {
    linkedApps: [...new Set(accounts.map((item) => item.appId))],
    linked: new Set(accounts.map((item) => item.appId)).size > 1,
  };
}

export async function createMediaLinkToken(account: LocalAccount) {
  const { mediaWorkspace } = await ensureMediaWorkspace(account);
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await mediaPrisma.mediaLinkToken.create({
    data: { mediaWorkspaceId: mediaWorkspace.id, tokenHash: tokenHash(token), expiresAt },
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function claimMediaLinkToken(account: LocalAccount, token: string) {
  const normalized = token.trim();
  if (normalized.length < 20) throw new Error("Enter a valid cloud library linking code.");
  const { mediaWorkspace: currentWorkspace } = await ensureMediaWorkspace(account);
  const link = await mediaPrisma.mediaLinkToken.findFirst({
    where: { tokenHash: tokenHash(normalized), usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!link) throw new Error("This linking code is invalid, expired or has already been used.");

  if (link.mediaWorkspaceId === currentWorkspace.id) {
    await mediaPrisma.mediaLinkToken.update({ where: { id: link.id }, data: { usedAt: new Date() } });
    return getMediaLinkStatus(account);
  }

  await mediaPrisma.$transaction(async (transaction) => {
    const freshLink = await transaction.mediaLinkToken.findFirst({
      where: { id: link.id, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!freshLink) throw new Error("This linking code is no longer available.");

    const targetWorkspaceId = freshLink.mediaWorkspaceId;
    const sourceWorkspaceId = currentWorkspace.id;
    await transaction.mediaAsset.updateMany({ where: { mediaWorkspaceId: sourceWorkspaceId }, data: { mediaWorkspaceId: targetWorkspaceId } });
    await transaction.mediaReference.updateMany({ where: { mediaWorkspaceId: sourceWorkspaceId }, data: { mediaWorkspaceId: targetWorkspaceId } });
    await transaction.mediaAccount.updateMany({ where: { mediaWorkspaceId: sourceWorkspaceId }, data: { mediaWorkspaceId: targetWorkspaceId } });
    await transaction.mediaLinkToken.updateMany({ where: { mediaWorkspaceId: sourceWorkspaceId }, data: { mediaWorkspaceId: targetWorkspaceId } });
    await transaction.mediaLinkToken.update({ where: { id: freshLink.id }, data: { usedAt: new Date() } });
    await transaction.mediaWorkspace.delete({ where: { id: sourceWorkspaceId } });
  });

  return getMediaLinkStatus(account);
}

