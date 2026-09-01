import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  const prisma = new PrismaClient();
  try {
  const [users, workspaces, matches, moments, submoments, seasons, clubs, competitions, momentTypes, subMomentTypes] = await Promise.all([
    prisma.user.findMany({ select: { username: true, workspaceId: true }, orderBy: { username: "asc" } }),
    prisma.workspace.findMany({ select: { id: true, name: true } }),
    prisma.match.count(), prisma.moment.count(), prisma.subMoment.count(), prisma.season.count(), prisma.club.count(), prisma.competition.count(), prisma.momentType.count(), prisma.subMomentType.count(),
  ]);
    console.log(JSON.stringify({ users, workspaces, counts: { matches, moments, submoments, seasons, clubs, competitions, momentTypes, subMomentTypes } }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main();

