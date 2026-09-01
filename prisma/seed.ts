import { PrismaClient } from "@prisma/client";
import { defaultMomentTypes, defaultSubMomentTypes, submomentCodesForMoment } from "../src/lib/default-analysis-types";

const prisma = new PrismaClient();

async function main() {
  const workspace = await prisma.workspace.upsert({ where: { id: "workspace_live_game" }, update: {}, create: { id: "workspace_live_game", name: "Live Game" } });
  for (const type of defaultMomentTypes) {
    await prisma.momentType.upsert({ where: { workspaceId_code: { workspaceId: workspace.id, code: type.code } }, update: type, create: { ...type, workspaceId: workspace.id } });
  }
  for (const type of defaultSubMomentTypes) {
    await prisma.subMomentType.upsert({ where: { workspaceId_code: { workspaceId: workspace.id, code: type.code } }, update: type, create: { ...type, workspaceId: workspace.id } });
  }

  const moments = await prisma.momentType.findMany({ where: { workspaceId: workspace.id }, select: { id: true, code: true } });
  const submoments = await prisma.subMomentType.findMany({ where: { workspaceId: workspace.id }, select: { id: true, code: true } });
  for (const moment of moments) {
    const allowedCodes = new Set(submomentCodesForMoment(moment.code));
    await prisma.momentType.update({
      where: { id: moment.id },
      data: { allowedSubmoments: { set: submoments.filter((type) => allowedCodes.has(type.code)).map((type) => ({ id: type.id })) } }
    });
  }
}

main().finally(() => prisma.$disconnect());
