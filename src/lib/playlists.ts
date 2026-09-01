import { PlaylistVisibility } from "@prisma/client";

import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const playlistInclude = {
  user: { select: { id: true, name: true, username: true } },
  items: {
    include: {
      moment: {
        include: {
          momentType: true,
          createdBy: { select: { id: true, name: true, username: true } },
          match: { select: { id: true, title: true } },
          subMoments: { include: { subMomentType: true } },
        },
      },
    },
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
  },
};

export async function listAvailablePlaylists() {
  const { user, workspace } = await requireWorkspace();
  return prisma.playlist.findMany({
    where: { workspaceId: workspace.id, OR: [{ userId: user.id }, { visibility: PlaylistVisibility.WORKSPACE }] },
    include: playlistInclude,
    orderBy: [{ userId: "asc" }, { isDefault: "desc" }, { name: "asc" }],
  });
}

export async function createPlaylist(input: Record<string, unknown>) {
  const { user, workspace } = await requireWorkspace();
  const name = String(input.name || "").trim();
  if (name.length < 2 || name.length > 80) throw new Error("The playlist name must contain between 2 and 80 characters.");
  const visibility = input.visibility === "WORKSPACE" ? PlaylistVisibility.WORKSPACE : PlaylistVisibility.PERSONAL;
  return prisma.playlist.create({ data: { workspaceId: workspace.id, userId: user.id, name, visibility }, include: playlistInclude });
}

export async function addMomentToPlaylist(playlistId: string, input: Record<string, unknown>) {
  const { user, workspace } = await requireWorkspace();
  const momentId = String(input.momentId || "");
  const [playlist, moment] = await Promise.all([
    prisma.playlist.findFirst({ where: { id: playlistId, userId: user.id, workspaceId: workspace.id } }),
    prisma.moment.findFirst({ where: { id: momentId, match: { workspaceId: workspace.id } }, select: { id: true } }),
  ]);
  if (!playlist) throw new Error("You can only change your own playlists.");
  if (!moment) throw new Error("The selected moment is not available in this workspace.");
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
  const sortOrder = await prisma.playlistItem.count({ where: { playlistId } });
  return prisma.playlistItem.upsert({
    where: { playlistId_momentId: { playlistId, momentId } },
    create: { playlistId, momentId, note, sortOrder },
    update: { note },
  });
}

export async function removePlaylistItem(playlistId: string, itemId: string) {
  const { user, workspace } = await requireWorkspace();
  const item = await prisma.playlistItem.findFirst({ where: { id: itemId, playlistId, playlist: { userId: user.id, workspaceId: workspace.id } } });
  if (!item) throw new Error("You can only change your own playlists.");
  await prisma.playlistItem.delete({ where: { id: item.id } });
}
