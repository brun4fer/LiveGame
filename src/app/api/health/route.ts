import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function databaseFingerprint() {
  try {
    const url = new URL(process.env.DATABASE_URL || "");
    return createHash("sha256").update(`${url.hostname}${url.pathname}`).digest("hex").slice(0, 12);
  } catch {
    return "invalid";
  }
}

export async function GET() {
  try {
    const [users, matches] = await Promise.all([prisma.user.count(), prisma.match.count()]);
    return Response.json({
      status: "ready",
      databaseFingerprint: databaseFingerprint(),
      hasUser: users > 0,
      hasMatchData: matches > 0
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "database_unavailable", databaseFingerprint: databaseFingerprint() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

