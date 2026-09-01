import { mediaPrisma } from "@/lib/media-prisma";

type LocalAccount = {
  user: { id: string; username: string };
  workspace: { id: string; name: string };
};

function mediaAppId() {
  const value = process.env.MEDIA_LIBRARY_APP_ID?.trim();
  if (!value) throw new Error("Missing MEDIA_LIBRARY_APP_ID.");
  return value;
}

export async function ensureMediaWorkspace(account: LocalAccount) {
  const appId = mediaAppId();
  const key = { appId_externalWorkspaceId: { appId, externalWorkspaceId: account.workspace.id } };
  const existing = await mediaPrisma.mediaAccount.findUnique({ where: key, include: { mediaWorkspace: true } });
  if (existing) return { appId, mediaWorkspace: existing.mediaWorkspace, mediaAccount: existing };

  try {
    const mediaWorkspace = await mediaPrisma.mediaWorkspace.create({
      data: {
        displayName: account.workspace.name || account.user.username,
        accounts: {
          create: {
            appId,
            externalWorkspaceId: account.workspace.id,
            externalUserId: account.user.id,
            username: account.user.username,
          },
        },
      },
      include: { accounts: true },
    });
    return { appId, mediaWorkspace, mediaAccount: mediaWorkspace.accounts[0] };
  } catch (error) {
    const created = await mediaPrisma.mediaAccount.findUnique({ where: key, include: { mediaWorkspace: true } });
    if (!created) throw error;
    return { appId, mediaWorkspace: created.mediaWorkspace, mediaAccount: created };
  }
}

